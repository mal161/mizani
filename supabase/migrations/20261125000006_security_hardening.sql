-- Security hardening from the Plan 1 final review.

-- 1. Clients never write case data directly; the server files cases with the service role.
drop policy if exists complainant_insert_own_case on public.cases;
revoke insert, update, delete on public.cases, public.case_events, public.documents from anon, authenticated;

-- 2. Profiles: only name and language are user-editable; phone (the login identity) and role are not.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, preferred_locale) on public.profiles to authenticated;
drop policy if exists own_profile_update on public.profiles;
create policy own_profile_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create unique index profiles_phone_unique on public.profiles (phone) where phone is not null;

-- 3. Login codes: atomic issue (per-phone and per-caller limits) and atomic attempt claim.
alter table public.login_codes add column caller text;
create index login_codes_caller_idx on public.login_codes (caller, created_at desc);

create or replace function public.issue_login_code(p_phone text, p_code_hash text, p_caller text, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('login:' || p_phone));
  perform pg_advisory_xact_lock(hashtext('login-caller:' || coalesce(p_caller, '')));
  if (select count(*) from login_codes where phone = p_phone and created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from login_codes where phone = p_phone and created_at > now() - interval '1 day') >= 8
     or (p_caller is not null and
         (select count(*) from login_codes where caller = p_caller and created_at > now() - interval '1 hour') >= 10)
  then
    return false;
  end if;
  insert into login_codes (phone, code_hash, caller, expires_at)
  values (p_phone, p_code_hash, p_caller, now() + make_interval(secs => p_ttl_seconds));
  return true;
end;
$$;

-- Consumes one attempt before the code is checked; returns nothing once 5 attempts are used.
create or replace function public.claim_login_attempt(p_phone text)
returns table (id uuid, code_hash text)
language sql
security definer
set search_path = public
as $$
  update login_codes lc
     set attempts = lc.attempts + 1
   where lc.id = (
           select l.id from login_codes l
            where l.phone = p_phone and l.used_at is null and l.expires_at > now()
            order by l.created_at desc
            limit 1
            for update
         )
     and lc.attempts < 5
  returning lc.id, lc.code_hash;
$$;

-- 4. Status checks: per-caller lockout (5 failures/hour) plus a per-case ceiling (30 failures/hour),
--    with the attempt recorded as a failure *before* the PIN is checked.
alter table public.status_attempts add column caller text;

create or replace function public.begin_status_attempt(p_case_number text, p_caller text, p_channel text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('status:' || p_case_number));
  if (select count(*) from status_attempts
       where case_number = p_case_number and caller = p_caller and not success
         and at > now() - interval '1 hour') >= 5
     or (select count(*) from status_attempts
       where case_number = p_case_number and not success
         and at > now() - interval '1 hour') >= 30
  then
    return null;
  end if;
  insert into status_attempts (case_number, caller, channel, success)
  values (p_case_number, p_caller, p_channel, false)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.issue_login_code(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.claim_login_attempt(text) from public, anon, authenticated;
revoke execute on function public.begin_status_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.issue_login_code(text, text, text, integer) to service_role;
grant execute on function public.claim_login_attempt(text) to service_role;
grant execute on function public.begin_status_attempt(text, text, text) to service_role;

-- 5. Look up an auth user by email (service role only) for idempotent account creation.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
