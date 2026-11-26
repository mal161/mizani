-- Plan 6: analytics. Aggregates only; executable by service_role only (the app checks the commissioner/admin role).
-- Periods are half-open [p_from, p_to); p_office null = all offices (filters cases.office).
-- A "stay" is the time a case spends in a stage: from entering it (cases.created_at for 'received', otherwise the
-- stage_changed event with body.to = stage) to the next stage_changed event. A case is "closed in period" when it is
-- closed now and its latest move to 'closed' falls in the period.

create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz, p_office text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select c.id, c.stage, c.channel, c.language, c.created_at from cases c where p_office is null or c.office = p_office
  ),
  filed as (select * from scope s where s.created_at >= p_from and s.created_at < p_to),
  closes as (
    select s.id, s.created_at, max(e.created_at) as closed_at
    from scope s
    join case_events e on e.case_id = s.id and e.type = 'stage_changed' and e.body->>'to' = 'closed'
    where s.stage = 'closed'
    group by s.id, s.created_at
  ),
  closed as (select * from closes x where x.closed_at >= p_from and x.closed_at < p_to),
  dl as (
    select d.due_at, d.met_at from case_deadlines d join scope s on s.id = d.case_id
    where d.due_at >= p_from and d.due_at < p_to and d.due_at < now()
  ),
  dec as (
    select d.outcome, d.amount_kes from decisions d join scope s on s.id = d.case_id
    where d.superseded_by is null and d.decided_at >= p_from and d.decided_at < p_to
  )
  select jsonb_build_object(
    'filed', (select count(*) from filed),
    'filed_online', (select count(*) from filed f where f.channel = 'online'),
    'filed_walk_in', (select count(*) from filed f where f.channel = 'walk_in'),
    'filed_sw', (select count(*) from filed f where f.language = 'sw'),
    'closed', (select count(*) from closed),
    'open_now', (select count(*) from scope s where s.stage <> 'closed'),
    'median_resolution_days', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from x.closed_at - x.created_at) / 86400))::numeric, 1)
      from closed x
    ),
    'deadlines_due', (select count(*) from dl),
    'deadlines_met', (select count(*) from dl where dl.met_at is not null and dl.met_at <= dl.due_at),
    'decisions', (select count(*) from dec),
    'outcomes', coalesce((select jsonb_object_agg(o.outcome, o.n) from (select dec.outcome, count(*) as n from dec group by dec.outcome) o), '{}'::jsonb),
    'refunds_kes', coalesce((select sum(dec.amount_kes) from dec where dec.outcome = 'refund_ordered'), 0)
  );
$$;

create or replace function public.analytics_stage_times(p_from timestamptz, p_to timestamptz, p_office text default null)
returns table (stage text, entered int, median_days numeric, p90_days numeric, open_now int, overdue_now int)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (select c.id, c.stage, c.created_at from cases c where p_office is null or c.office = p_office),
  entries as (
    select s.id as case_id, 'received'::text as st, s.created_at as entered_at from scope s
    union all
    select e.case_id, e.body->>'to', e.created_at
    from case_events e join scope s on s.id = e.case_id
    where e.type = 'stage_changed'
  ),
  stays as (
    select en.case_id, en.st, en.entered_at, lead(en.entered_at) over (partition by en.case_id order by en.entered_at) as left_at
    from entries en
  ),
  p as (
    select y.st, extract(epoch from y.left_at - y.entered_at) / 86400 as days
    from stays y where y.entered_at >= p_from and y.entered_at < p_to
  ),
  canon (st, ord) as (
    values ('received', 1), ('screening', 2), ('advocate_notified', 3), ('investigation', 4), ('conciliation', 5), ('hearing', 6), ('decision', 7)
  )
  select
    c.st,
    (select count(*) from p where p.st = c.st)::int,
    (select round((percentile_cont(0.5) within group (order by p.days))::numeric, 1) from p where p.st = c.st and p.days is not null),
    (select round((percentile_cont(0.9) within group (order by p.days))::numeric, 1) from p where p.st = c.st and p.days is not null),
    (select count(*) from scope s where s.stage = c.st)::int,
    (
      select count(*) from case_deadlines d join scope s on s.id = d.case_id
      where d.kind = 'stage' and d.stage = c.st and d.met_at is null and d.due_at < now()
    )::int
  from canon c
  order by c.ord;
$$;

-- Officers with at least one case in scope (idle accounts would only add noise).
create or replace function public.analytics_officers(p_from timestamptz, p_to timestamptz, p_office text default null)
returns table (
  officer_id uuid, full_name text, office text, open_now int, assigned_in_period int, closed_in_period int,
  median_resolution_days numeric, overdue_now int
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select c.id, c.stage, c.created_at, c.assigned_officer_id from cases c
    where (p_office is null or c.office = p_office) and c.assigned_officer_id is not null
  ),
  closes as (
    select s.id, s.assigned_officer_id, s.created_at, max(e.created_at) as closed_at
    from scope s
    join case_events e on e.case_id = s.id and e.type = 'stage_changed' and e.body->>'to' = 'closed'
    where s.stage = 'closed'
    group by s.id, s.assigned_officer_id, s.created_at
  ),
  closed as (select * from closes x where x.closed_at >= p_from and x.closed_at < p_to),
  officers as (
    select pr.id, pr.full_name, pr.office from profiles pr
    where pr.role in ('staff', 'admin') and pr.active
      and (p_office is null or pr.office = p_office)
      and exists (select 1 from scope s where s.assigned_officer_id = pr.id)
  )
  select
    o.id,
    o.full_name,
    o.office,
    (select count(*) from scope s where s.assigned_officer_id = o.id and s.stage <> 'closed')::int as open_now,
    (select count(*) from scope s where s.assigned_officer_id = o.id and s.created_at >= p_from and s.created_at < p_to)::int,
    (select count(*) from closed x where x.assigned_officer_id = o.id)::int,
    (
      select round((percentile_cont(0.5) within group (order by extract(epoch from x.closed_at - x.created_at) / 86400))::numeric, 1)
      from closed x where x.assigned_officer_id = o.id
    ),
    (
      select count(*) from case_deadlines d join scope s on s.id = d.case_id
      where s.assigned_officer_id = o.id and s.stage <> 'closed' and d.met_at is null and d.due_at < now()
    )::int
  from officers o
  order by open_now desc, o.full_name;
$$;

create or replace function public.analytics_categories(p_from timestamptz, p_to timestamptz, p_office text default null)
returns table (month date, category text, filed int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (date_trunc('month', c.created_at at time zone 'Africa/Nairobi'))::date as m,
    coalesce(c.category, 'uncategorised') as cat,
    count(*)::int
  from cases c
  where (p_office is null or c.office = p_office) and c.created_at >= p_from and c.created_at < p_to
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.analytics_repeat_advocates(
  p_from timestamptz, p_to timestamptz, p_office text default null, p_min int default 2
)
returns table (
  advocate_id uuid, full_name text, admission_no text, complaints int, open_now int, upheld int, referred int, last_filed timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with sc as (
    select c.id, c.advocate_id as adv, c.stage, c.created_at from cases c
    where c.advocate_id is not null and (p_office is null or c.office = p_office) and c.created_at >= p_from and c.created_at < p_to
  ),
  agg as (
    select sc.adv, count(*)::int as n, (count(*) filter (where sc.stage <> 'closed'))::int as open_n, max(sc.created_at) as last_at
    from sc group by sc.adv having count(*) >= p_min
  ),
  dec as (
    select sc.adv,
      (count(*) filter (where d.outcome in ('admonished', 'refund_ordered', 'referred_to_tribunal')))::int as up,
      (count(*) filter (where d.outcome = 'referred_to_tribunal'))::int as ref
    from sc join decisions d on d.case_id = sc.id and d.superseded_by is null
    group by sc.adv
  )
  select a.adv, v.full_name, v.admission_no, a.n, a.open_n, coalesce(d.up, 0), coalesce(d.ref, 0), a.last_at
  from agg a
  join advocates v on v.id = a.adv
  left join dec d on d.adv = a.adv
  order by a.n desc, a.last_at desc
  limit 50;
$$;

revoke execute on function public.analytics_overview(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.analytics_stage_times(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.analytics_officers(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.analytics_categories(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.analytics_repeat_advocates(timestamptz, timestamptz, text, int) from public, anon, authenticated;
grant execute on function public.analytics_overview(timestamptz, timestamptz, text) to service_role;
grant execute on function public.analytics_stage_times(timestamptz, timestamptz, text) to service_role;
grant execute on function public.analytics_officers(timestamptz, timestamptz, text) to service_role;
grant execute on function public.analytics_categories(timestamptz, timestamptz, text) to service_role;
grant execute on function public.analytics_repeat_advocates(timestamptz, timestamptz, text, int) to service_role;
