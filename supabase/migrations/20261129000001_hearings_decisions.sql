-- Hearings, decisions and Disciplinary Tribunal referrals. Staff-type roles read; all writes server-side.

create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  mode text not null check (mode in ('in_person', 'online')),
  venue text,
  online_link text,
  panel uuid[] not null check (cardinality(panel) between 1 and 5),
  status text not null default 'scheduled' check (status in ('scheduled', 'held', 'adjourned', 'cancelled')),
  minutes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index hearings_one_scheduled on public.hearings (case_id) where status = 'scheduled';
create index hearings_starts_idx on public.hearings (starts_at);
create trigger hearings_touch before update on public.hearings for each row execute function public.touch_updated_at();

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  outcome text not null check (outcome in ('dismissed', 'withdrawn', 'settled', 'admonished', 'refund_ordered', 'referred_to_tribunal')),
  reasons text not null check (char_length(reasons) between 50 and 20000),
  orders text,
  amount_kes numeric(14, 2) check (amount_kes is null or amount_kes > 0),
  panel uuid[] not null check (cardinality(panel) between 1 and 5),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz not null default now(),
  superseded_by uuid references public.decisions (id),
  check (outcome <> 'refund_ordered' or amount_kes is not null)
);
create index decisions_case_idx on public.decisions (case_id, decided_at desc);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  decision_id uuid not null references public.decisions (id),
  tribunal_reference text,
  status text not null default 'prepared' check (status in ('prepared', 'lodged', 'acknowledged', 'concluded')),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger referrals_touch before update on public.referrals for each row execute function public.touch_updated_at();

-- Audit every write (DB-level, on top of the actor-attributed app audit rows).
create trigger hearings_audit after insert or update or delete on public.hearings for each row execute function public.audit_row_change();
create trigger decisions_audit after insert or update or delete on public.decisions for each row execute function public.audit_row_change();
create trigger referrals_audit after insert or update or delete on public.referrals for each row execute function public.audit_row_change();

alter table public.hearings enable row level security;
alter table public.decisions enable row level security;
alter table public.referrals enable row level security;
revoke all on public.hearings, public.decisions, public.referrals from anon, authenticated;
grant select on public.hearings, public.decisions, public.referrals to authenticated;
create policy staff_read_hearings on public.hearings for select to authenticated using (public.staff_role() is not null);
create policy staff_read_decisions on public.decisions for select to authenticated using (public.staff_role() is not null);
create policy staff_read_referrals on public.referrals for select to authenticated using (public.staff_role() is not null);

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('due_soon', 'overdue', 'assigned', 'info_provided', 'advocate_responded', 'hearing_scheduled'));
