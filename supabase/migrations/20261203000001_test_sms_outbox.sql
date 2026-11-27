-- Test SMS inbox: what Mizani would have texted while SMS is in test mode (SMS_PROVIDER=fake, SMS_TEST_INBOX=on),
-- so a demo or test deployment can be used without a real SMS provider. Read only by the server (service role) for
-- administrators; no client may read or write. Purged after 7 days, and entirely once real SMS is on (daily cron).

create table public.test_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index test_sms_outbox_created_idx on public.test_sms_outbox (created_at desc);

alter table public.test_sms_outbox enable row level security;
-- No policies: with RLS on, signed-in users (staff included) and anonymous callers see and change nothing.
