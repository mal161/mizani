-- Race-safe stage change: only applies if the case is still at p_from; writes the event in the same transaction.
create or replace function public.transition_case_stage(
  p_case_id uuid, p_from text, p_to text, p_actor uuid, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update cases set stage = p_to where id = p_case_id and stage = p_from;
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  insert into case_events (case_id, type, visibility, actor_id, body)
  values (
    p_case_id, 'stage_changed', 'parties', p_actor,
    jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason))
  );
  return true;
end;
$$;
revoke execute on function public.transition_case_stage(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_case_stage(uuid, text, text, uuid, text) to service_role;
