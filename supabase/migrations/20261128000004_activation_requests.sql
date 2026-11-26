-- Per-caller limit on activation attempts (admission numbers are public, so codes must not be lockable at scale).
create table public.activation_requests (
  id bigserial primary key,
  caller text not null,
  at timestamptz not null default now()
);
create index activation_requests_caller_idx on public.activation_requests (caller, at desc);
alter table public.activation_requests enable row level security;
revoke all on public.activation_requests from anon, authenticated;

create or replace function public.note_activation_request(p_caller text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('activation-caller:' || p_caller));
  if (select count(*) from activation_requests where caller = p_caller and at > now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into activation_requests (caller) values (p_caller);
  return true;
end;
$$;
revoke execute on function public.note_activation_request(text) from public, anon, authenticated;
grant execute on function public.note_activation_request(text) to service_role;
