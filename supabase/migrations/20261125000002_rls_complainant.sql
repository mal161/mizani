-- Complainant access. Complainants read cases only through my_cases (no pin_hash);
-- they have no direct SELECT on public.cases.

create or replace function public.is_my_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from cases where id = p_case_id and complainant_id = auth.uid());
$$;
revoke execute on function public.is_my_case(uuid) from public, anon;
grant execute on function public.is_my_case(uuid) to authenticated;

-- Owner-rights view filtered to the caller; deliberately omits pin_hash and assignment internals.
create view public.my_cases
with (security_barrier = true)
as
select id, case_number, advocate_id, advocate_name_given, category, stage, summary,
       description, language, channel, created_at, updated_at
from public.cases
where complainant_id = auth.uid();

revoke all on public.my_cases from public, anon;
grant select on public.my_cases to authenticated;

create policy complainant_insert_own_case on public.cases
  for insert to authenticated
  with check (
    complainant_id = auth.uid()
    and filed_by = auth.uid()
    and channel = 'online'
  );

create policy complainant_read_events on public.case_events
  for select to authenticated
  using (visibility <> 'internal' and public.is_my_case(case_id));

create policy complainant_read_documents on public.documents
  for select to authenticated
  using (visibility <> 'internal' and public.is_my_case(case_id));

create policy own_profile_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy own_profile_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- Advocates roll is public reference data (name, admission no, firm) for the complaint form.
create policy advocates_public_read on public.advocates
  for select to anon, authenticated
  using (true);
-- Contact details stay private: table-level grant replaced with a column list.
revoke select on public.advocates from anon, authenticated;
grant select (id, admission_no, full_name, firm) on public.advocates to anon, authenticated;
