-- Records a Commission decision in one transaction, serialised per case (row lock), so concurrent submissions
-- cannot leave two active decisions. Authorisation (role, panel membership) is checked by the app before calling;
-- this function enforces the case-state rules:
--   * stage must be "hearing" or "decision";
--   * a first decision (stage "hearing") needs a held hearing;
--   * the previous active decision, if any, is superseded (and its tribunal referral carried over when the new
--     outcome is also a referral);
--   * any still-scheduled hearing is cancelled (the parties are told by the decision itself);
--   * hearing -> decision stage move, decision_issued event (parties; advocate when notified), referral row.
create or replace function public.record_decision(
  p_case_id uuid, p_outcome text, p_reasons text, p_orders text, p_amount numeric, p_panel uuid[], p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  prev record;
  new_id uuid;
  decided timestamptz;
  ref_id uuid;
  moved boolean := false;
  body jsonb;
begin
  select id, stage, advocate_notified_at into c from cases where id = p_case_id for update;
  if not found then
    raise exception 'case not found';
  end if;
  if c.stage not in ('hearing', 'decision') then
    raise exception 'cannot record a decision at stage %', c.stage;
  end if;
  if c.stage = 'hearing' and not exists (select 1 from hearings where case_id = p_case_id and status = 'held') then
    raise exception 'the hearing must be held (minutes recorded) before a decision';
  end if;

  select id, outcome, amount_kes into prev
  from decisions where case_id = p_case_id and superseded_by is null
  order by decided_at desc limit 1;

  insert into decisions (case_id, outcome, reasons, orders, amount_kes, panel, decided_by)
  values (p_case_id, p_outcome, p_reasons, p_orders, p_amount, p_panel, p_actor)
  returning id, decided_at into new_id, decided;

  if prev.id is not null then
    update decisions set superseded_by = new_id where id = prev.id;
  end if;

  update hearings set status = 'cancelled' where case_id = p_case_id and status = 'scheduled';

  if c.stage = 'hearing' then
    moved := transition_case_stage(p_case_id, 'hearing', 'decision', p_actor, null);
  end if;

  body := jsonb_build_object(
    'decision_id', new_id, 'outcome', p_outcome, 'reasons', p_reasons, 'orders', p_orders,
    'amount_kes', p_amount, 'decided_at', decided
  );
  if prev.id is not null then
    body := body || jsonb_build_object('corrected', true);
  end if;
  insert into case_events (case_id, type, visibility, advocate_visible, actor_id, body)
  values (p_case_id, 'decision_issued', 'parties', c.advocate_notified_at is not null, p_actor, body);

  if p_outcome = 'referred_to_tribunal' then
    update referrals set decision_id = new_id, updated_by = p_actor
    where decision_id = prev.id
    returning id into ref_id;
    if ref_id is null then
      insert into referrals (case_id, decision_id, updated_by) values (p_case_id, new_id, p_actor) returning id into ref_id;
    end if;
  end if;

  return jsonb_build_object(
    'decision_id', new_id, 'decided_at', decided, 'referral_id', ref_id, 'moved', moved,
    'previous_outcome', prev.outcome, 'previous_amount', prev.amount_kes
  );
end;
$$;
revoke execute on function public.record_decision(uuid, text, text, text, numeric, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.record_decision(uuid, text, text, text, numeric, uuid[], uuid) to service_role;
