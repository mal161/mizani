-- AI output lives apart from human-entered records and is only ever shown labelled as AI.
create table public.ai_outputs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  kind text not null check (kind in ('triage', 'case_summary')),
  provider text not null,
  model text not null,
  status text not null check (status in ('ok', 'unavailable')),
  output jsonb,
  error text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index ai_outputs_case_idx on public.ai_outputs (case_id, kind, created_at desc);
alter table public.ai_outputs enable row level security;
create policy staff_read_ai_outputs on public.ai_outputs
  for select to authenticated using (public.staff_role() is not null);
revoke all on public.ai_outputs from anon, authenticated;
grant select on public.ai_outputs to authenticated;

insert into public.settings (key, value) values ('ai_enabled', 'true') on conflict (key) do nothing;
