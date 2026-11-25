-- Public status-check attempts, for lockout after repeated wrong PINs. Service role only.
create table public.status_attempts (
  id bigserial primary key,
  case_number text not null,
  at timestamptz not null default now(),
  success boolean not null,
  channel text not null
);
create index status_attempts_case_idx on public.status_attempts (case_number, at desc);
alter table public.status_attempts enable row level security;
