-- Staff read access, gated on role AND a completed MFA step (aal2). Writes stay server-side.

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
    from profiles p
   where p.id = auth.uid()
     and p.role in ('staff', 'admin', 'commissioner')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
revoke execute on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated;

create view public.staff_cases
with (security_barrier = true)
as
select c.id, c.case_number, c.complainant_id, c.advocate_id, c.advocate_name_given, c.category,
       c.stage, c.priority, c.summary, c.description, c.language, c.channel,
       c.assigned_officer_id, c.filed_by, c.office, c.created_at, c.updated_at,
       cp.full_name as complainant_name,
       cp.phone as complainant_phone,
       op.full_name as assigned_officer_name
  from public.cases c
  join public.profiles cp on cp.id = c.complainant_id
  left join public.profiles op on op.id = c.assigned_officer_id
 where public.staff_role() is not null;

revoke all on public.staff_cases from public, anon;
grant select on public.staff_cases to authenticated;

create policy staff_read_events on public.case_events
  for select to authenticated
  using (public.staff_role() is not null);

create policy staff_read_documents on public.documents
  for select to authenticated
  using (public.staff_role() is not null);

create policy staff_read_profiles on public.profiles
  for select to authenticated
  using (public.staff_role() is not null);

create policy admin_read_audit on public.audit_log
  for select to authenticated
  using (public.staff_role() = 'admin');

grant select on public.audit_log to authenticated;
