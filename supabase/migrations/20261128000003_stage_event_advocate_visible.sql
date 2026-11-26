-- Stage changes after the advocate has been notified also appear on the advocate's timeline.
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
  notified boolean;
begin
  update cases set stage = p_to where id = p_case_id and stage = p_from
  returning advocate_notified_at is not null into notified;
  get diagnostics n = row_count;
  if n = 0 then
    return false;
  end if;
  insert into case_events (case_id, type, visibility, actor_id, body, advocate_visible)
  values (
    p_case_id, 'stage_changed', 'parties', p_actor,
    jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason)),
    coalesce(notified, false)
  );
  return true;
end;
$$;
revoke execute on function public.transition_case_stage(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_case_stage(uuid, text, text, uuid, text) to service_role;
