-- Advocate portal: formal notification, activation, responses, and advocate read access.

alter table public.cases
  add column advocate_notified_at timestamptz,
  add column advocate_served_on date,
  add column advocate_service_method text check (advocate_service_method in ('email', 'sms', 'hand', 'post', 'courier'));

alter table public.case_events add column advocate_visible boolean not null default false;
alter table public.documents add column shared_with_advocate boolean not null default false;

create table public.advocate_activations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  advocate_id uuid not null references public.advocates (id),
  code_hash text not null,
  attempts integer not null default 0,
  pending_phone text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index advocate_activations_one_open on public.advocate_activations (case_id) where used_at is null;
alter table public.advocate_activations enable row level security;
revoke all on public.advocate_activations from anon, authenticated;

create table public.advocate_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  advocate_profile_id uuid not null references public.profiles (id),
  text text not null check (char_length(text) between 1 and 20000),
  late boolean not null,
  created_at timestamptz not null default now()
);
create index advocate_responses_case_idx on public.advocate_responses (case_id, created_at);
alter table public.advocate_responses enable row level security;
revoke all on public.advocate_responses from anon, authenticated;
grant select on public.advocate_responses to authenticated;
create policy staff_read_advocate_responses on public.advocate_responses
  for select to authenticated using (public.staff_role() is not null);
create policy advocate_read_own_responses on public.advocate_responses
  for select to authenticated using (advocate_profile_id = auth.uid());

-- The caller is the active advocate linked to this case's roll entry, and the case has been formally notified.
create or replace function public.is_my_advocate_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from cases c
      join advocates a on a.id = c.advocate_id
      join profiles p on p.id = a.profile_id
     where c.id = p_case_id
       and c.advocate_notified_at is not null
       and a.profile_id = auth.uid()
       and p.role = 'advocate'
       and p.active
  );
$$;
revoke execute on function public.is_my_advocate_case(uuid) from public, anon;
grant execute on function public.is_my_advocate_case(uuid) to authenticated;

-- What an advocate may see of a case: no complainant contact details, no PIN, no internal fields.
create view public.advocate_cases
with (security_barrier = true)
as
select c.id, c.case_number, c.created_at, c.stage, c.summary, c.description, c.advocate_served_on,
       cp.full_name as complainant_name,
       (select min(d.due_at) from public.case_deadlines d
         where d.case_id = c.id and d.kind = 'advocate_response' and d.met_at is null) as response_due
  from public.cases c
  join public.profiles cp on cp.id = c.complainant_id
 where public.is_my_advocate_case(c.id);
revoke all on public.advocate_cases from public, anon;
grant select on public.advocate_cases to authenticated;

create policy advocate_read_events on public.case_events
  for select to authenticated
  using (advocate_visible and public.is_my_advocate_case(case_id));

create policy advocate_read_documents on public.documents
  for select to authenticated
  using (public.is_my_advocate_case(case_id) and (shared_with_advocate or uploaded_by = auth.uid()));

-- Staff alert when an advocate responds.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('due_soon', 'overdue', 'assigned', 'info_provided', 'advocate_responded'));
