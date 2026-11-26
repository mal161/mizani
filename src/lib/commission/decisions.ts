import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { getSmsProvider } from "@/lib/sms";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { openStageDeadline } from "@/lib/cases/deadlines";
import { smsText } from "@/lib/cases/messages";
import type { Locale } from "@/i18n/routing";
import { OUTCOME_LABELS, isOutcome, type Outcome } from "./outcomes";

export interface DecisionInput {
  outcome: Outcome;
  reasons: string;
  orders?: string;
  amountKes?: number;
  panel: string[];
}

/**
 * A commissioner on the panel (or an admin) records the Commission's decision. At stage "hearing" the case moves to
 * "decision"; at "decision" the new record corrects (supersedes) the previous one. The outcome, reasons, orders and
 * amount are published to both parties; a tribunal referral opens a referral record.
 */
export async function recordDecisionAs(
  actor: StaffUser,
  caseId: string,
  input: DecisionInput,
): Promise<{ decisionId: string; referralId: string | null }> {
  if (actor.role !== "commissioner" && actor.role !== "admin") throw new ForbiddenError();
  if (!isOutcome(input.outcome)) throw new Error("unknown outcome");
  const reasons = input.reasons.trim();
  if (reasons.length < 50 || reasons.length > 20000) throw new Error("reasons must be 50-20000 characters");
  const orders = input.orders?.trim() || null;
  const amount = input.outcome === "refund_ordered" ? input.amountKes : undefined;
  if (input.outcome === "refund_ordered" && !(typeof amount === "number" && amount > 0 && amount < 1e12)) {
    throw new Error("a refund order needs a positive amount in KES");
  }
  const panel = [...new Set(input.panel)];
  if (panel.length < 1 || panel.length > 5) throw new Error("panel must have 1-5 members");
  if (actor.role === "commissioner" && !panel.includes(actor.id)) throw new Error("only a commissioner on the panel can record the decision");

  const admin = createAdminClient();
  const { data: members } = await admin.from("profiles").select("id").in("id", panel).in("role", ["commissioner", "admin"]).eq("active", true);
  if ((members ?? []).length !== panel.length) throw new Error("every panel member must be an active commissioner");

  const { data: c, error } = await admin
    .from("cases")
    .select("case_number,stage,language,advocate_notified_at,complainant:profiles!cases_complainant_id_fkey(phone),advocates(phone)")
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case: ${error.message}`);
  if (c.stage !== "hearing" && c.stage !== "decision") throw new Error(`cannot record a decision at stage ${c.stage}`);

  // Only a commissioner who sat on the case (the held hearing's panel, or the panel of the decision being
  // corrected) may decide it. Admins may record for any panel.
  const [{ data: held }, { data: current }] = await Promise.all([
    admin.from("hearings").select("panel").eq("case_id", caseId).eq("status", "held").order("starts_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("decisions").select("panel").eq("case_id", caseId).is("superseded_by", null).order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Re-checked inside record_decision under the case lock.
  if (c.stage === "hearing" && !held) throw new Error("the hearing must be held (minutes recorded) before a decision");
  if (actor.role === "commissioner") {
    const sat = [...((held?.panel as string[] | undefined) ?? []), ...((current?.panel as string[] | undefined) ?? [])];
    if (!sat.includes(actor.id)) throw new Error("only a commissioner on the hearing panel can record the decision");
  }

  const { data: r, error: rErr } = await admin.rpc("record_decision", {
    p_case_id: caseId,
    p_outcome: input.outcome,
    p_reasons: reasons,
    p_orders: orders,
    p_amount: amount ?? null,
    p_panel: panel,
    p_actor: actorId(actor),
  });
  if (rErr) throw new Error(`record decision: ${rErr.message}`);
  const res = r as { decision_id: string; referral_id: string | null; moved: boolean; previous_outcome: string | null; previous_amount: number | null };
  const correcting = res.previous_outcome !== null;
  if (res.moved) await openStageDeadline(caseId, "decision");

  const notified = Boolean(c.advocate_notified_at);
  const sms = getSmsProvider();
  const lang = c.language as Locale;
  const complainantPhone = (c.complainant as unknown as { phone: string | null } | null)?.phone;
  const advocatePhone = notified ? (c.advocates as unknown as { phone: string | null } | null)?.phone : null;
  await Promise.allSettled([
    complainantPhone ? sms.send(complainantPhone, smsText.decisionIssued(lang, c.case_number, OUTCOME_LABELS[lang][input.outcome])) : null,
    advocatePhone ? sms.send(advocatePhone, smsText.decisionIssued("en", c.case_number, OUTCOME_LABELS.en[input.outcome])) : null,
  ]);

  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "record_decision",
    entity: "cases",
    entityId: caseId,
    details: {
      decision_id: res.decision_id,
      corrected: correcting,
      before: correcting ? { outcome: res.previous_outcome, amount_kes: res.previous_amount } : null,
      after: { outcome: input.outcome, amount_kes: amount ?? null },
      panel,
    },
  });
  return { decisionId: res.decision_id, referralId: res.referral_id };
}

export interface DecisionRow {
  id: string;
  case_id: string;
  outcome: Outcome;
  reasons: string;
  orders: string | null;
  amount_kes: number | null;
  panel: string[];
  decided_at: string;
  superseded_by: string | null;
}

export async function currentDecision(caseId: string): Promise<DecisionRow | null> {
  const { data } = await createAdminClient()
    .from("decisions")
    .select("*")
    .eq("case_id", caseId)
    .is("superseded_by", null)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DecisionRow | null) ?? null;
}
