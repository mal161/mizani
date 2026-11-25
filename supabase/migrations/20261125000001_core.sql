-- Mizani core schema: profiles, advocates roll, cases, timeline, documents, settings, audit log.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'complainant'
    check (role in ('complainant', 'advocate', 'staff', 'admin', 'commissioner')),
  full_name text,
  phone text,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'sw')),
  office text,
  created_at timestamptz not null default now()
);

create table public.advocates (
  id uuid primary key default gen_random_uuid(),
  admission_no text not null unique,
  full_name text not null,
  phone text,
  email text,
  firm text,
  profile_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index advocates_name_idx on public.advocates using gin (to_tsvector('simple', full_name));

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  complainant_id uuid not null references public.profiles (id),
  advocate_id uuid references public.advocates (id),
  advocate_name_given text not null,
  category text,
  stage text not null default 'received',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  summary text not null,
  description text not null,
  language text not null default 'en' check (language in ('en', 'sw')),
  channel text not null check (channel in ('online', 'walk_in')),
  pin_hash text not null,
  assigned_officer_id uuid references public.profiles (id),
  filed_by uuid not null references public.profiles (id),
  office text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_complainant_idx on public.cases (complainant_id);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  type text not null,
  visibility text not null check (visibility in ('public', 'parties', 'internal')),
  actor_id uuid references public.profiles (id),
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index case_events_case_idx on public.case_events (case_id, created_at);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime text not null,
  size_bytes integer not null,
  uploaded_by uuid references public.profiles (id),
  visibility text not null default 'parties' check (visibility in ('public', 'parties', 'internal')),
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_channel text not null default 'system',
  action text not null,
  entity text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- Case numbers: ACC/<YYYY>/<000001>, one counter per year, row-locked.
create table public.case_number_counters (
  year integer primary key,
  last_value integer not null default 0
);

create or replace function public.next_case_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from now() at time zone 'Africa/Nairobi');
  n integer;
begin
  insert into case_number_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = case_number_counters.last_value + 1
  returning last_value into n;
  return format('ACC/%s/%s', y, lpad(n::text, 6, '0'));
end;
$$;

-- Audit: every write to case data is recorded; the audit log itself is immutable.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_id text := coalesce(new.id, old.id)::text;
begin
  insert into audit_log (actor_id, actor_channel, action, entity, entity_id, details)
  values (
    auth.uid(),
    'db',
    lower(tg_op),
    tg_table_name,
    rec_id,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('old', to_jsonb(old) - 'pin_hash', 'new', to_jsonb(new) - 'pin_hash')
      else '{}'::jsonb end
  );
  return coalesce(new, old);
end;
$$;

create trigger cases_audit after insert or update or delete on public.cases
  for each row execute function public.audit_row_change();
create trigger case_events_audit after insert or update or delete on public.case_events
  for each row execute function public.audit_row_change();
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function public.audit_row_change();

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger cases_touch before update on public.cases
  for each row execute function public.touch_updated_at();

-- RLS on everything; policies are added per role in later migrations.
alter table public.profiles enable row level security;
alter table public.advocates enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.documents enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.case_number_counters enable row level security;

revoke execute on function public.next_case_number() from public, anon, authenticated;
grant execute on function public.next_case_number() to service_role;
