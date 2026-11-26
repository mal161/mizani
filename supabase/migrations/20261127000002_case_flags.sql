-- Duplicate and repeat-advocate flags: plain queries on ids, no AI involved.
create or replace function public.case_flags(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select id, complainant_id, advocate_id, lower(trim(advocate_name_given)) as adv_name, created_at
      from cases where id = p_case_id
  )
  select jsonb_build_object(
    'possible_duplicates',
    coalesce((
      select jsonb_agg(jsonb_build_object('case_number', o.case_number, 'created_at', o.created_at) order by o.created_at)
        from cases o, c
       where o.id <> c.id
         and o.complainant_id = c.complainant_id
         and (
           (c.advocate_id is not null and o.advocate_id = c.advocate_id)
           or (c.advocate_id is null and o.advocate_id is null and lower(trim(o.advocate_name_given)) = c.adv_name)
         )
         and abs(extract(epoch from (o.created_at - c.created_at))) <= 90 * 86400
    ), '[]'::jsonb),
    'advocate_history',
    (
      select case when c.advocate_id is null then null else jsonb_build_object(
        'total', count(*),
        'open', count(*) filter (where o.stage <> 'closed'),
        'closed', count(*) filter (where o.stage = 'closed'),
        'last_12_months', count(*) filter (where o.created_at > now() - interval '12 months')
      ) end
        from c left join cases o on o.advocate_id = c.advocate_id
       group by c.advocate_id
    )
  )
  from c;
$$;
revoke execute on function public.case_flags(uuid) from public, anon, authenticated;
grant execute on function public.case_flags(uuid) to service_role;
