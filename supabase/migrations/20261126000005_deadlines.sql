create table public.case_deadlines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('stage', 'info_request', 'advocate_response')),
  stage text,
  due_at timestamptz not null,
  met_at timestamptz,
  created_at timestamptz not null default now()
);
create index case_deadlines_open_idx on public.case_deadlines (due_at) where met_at is null;
create index case_deadlines_case_idx on public.case_deadlines (case_id);
alter table public.case_deadlines enable row level security;
create policy staff_read_deadlines on public.case_deadlines
  for select to authenticated using (public.staff_role() is not null);
revoke insert, update, delete on public.case_deadlines from anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  case_id uuid references public.cases (id) on delete cascade,
  deadline_id uuid references public.case_deadlines (id) on delete cascade,
  kind text not null check (kind in ('due_soon', 'overdue', 'assigned', 'info_provided')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (deadline_id, user_id, kind)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy own_notifications_read on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy own_notifications_mark_read on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace view public.staff_cases
with (security_barrier = true)
as
select c.id, c.case_number, c.complainant_id, c.advocate_id, c.advocate_name_given, c.category,
       c.stage, c.priority, c.summary, c.description, c.language, c.channel,
       c.assigned_officer_id, c.filed_by, c.office, c.created_at, c.updated_at,
       cp.full_name as complainant_name,
       cp.phone as complainant_phone,
       op.full_name as assigned_officer_name,
       (select min(d.due_at) from public.case_deadlines d where d.case_id = c.id and d.met_at is null)
         as open_deadline_due
  from public.cases c
  join public.profiles cp on cp.id = c.complainant_id
  left join public.profiles op on op.id = c.assigned_officer_id
 where public.staff_role() is not null;
