alter table public.profiles add column active boolean not null default true;

create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  position integer not null default 0,
  category text,
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  office text,
  officer_ids uuid[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.routing_rules enable row level security;
create policy staff_read_routing on public.routing_rules
  for select to authenticated
  using (public.staff_role() is not null);
revoke insert, update, delete on public.routing_rules from anon, authenticated;
