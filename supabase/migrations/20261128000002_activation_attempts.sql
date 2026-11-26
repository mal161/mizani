-- Consumes one attempt on every open activation for this advocate *before* the code is compared,
-- so parallel guesses cannot exceed 5 per code. Returns the rows still within their attempt budget.
create or replace function public.claim_activation_attempts(p_advocate_id uuid)
returns table (id uuid, case_id uuid, code_hash text)
language sql
security definer
set search_path = public
as $$
  update advocate_activations a
     set attempts = a.attempts + 1
   where a.advocate_id = p_advocate_id
     and a.used_at is null
     and a.expires_at > now()
     and a.attempts < 5
  returning a.id, a.case_id, a.code_hash;
$$;
revoke execute on function public.claim_activation_attempts(uuid) from public, anon, authenticated;
grant execute on function public.claim_activation_attempts(uuid) to service_role;
