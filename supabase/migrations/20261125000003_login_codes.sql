-- One-time SMS login codes. Service role only (RLS on, no policies).
create table public.login_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index login_codes_phone_idx on public.login_codes (phone, created_at desc);
alter table public.login_codes enable row level security;
