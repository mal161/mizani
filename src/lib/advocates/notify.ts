import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { getSmsProvider } from "@/lib/sms";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { changeStageAs } from "@/lib/cases/actions";
import { addDeadline, meetDeadlines } from "@/lib/cases/deadlines";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { smsText } from "@/lib/cases/messages";
import { createActivation } from "./activation";

export type ServiceMethod = "email" | "sms" | "hand" | "post" | "courier";
const METHODS: ServiceMethod[] = ["email", "sms", "hand", "post", "courier"];

export interface NotifyInput {
  servedOn: string; // YYYY-MM-DD
  method: ServiceMethod;
  shareDocumentIds: string[];
}

export interface NotifyResult {
  activationCode: string;
  responseDue: string; // YYYY-MM-DD (Nairobi)
}

const nairobiDate = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Formally notifies the roll advocate of a complaint: records service, shares chosen evidence, issues an
 * activation code, opens the response deadline (service date + response window, end of day Nairobi), moves the
 * case to "advocate notified" and texts the advocate. Re-notifying replaces the code and the deadline.
 */
export async function notifyAdvocateAs(actor: StaffUser, caseId: string, input: NotifyInput): Promise<NotifyResult> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  if (!METHODS.includes(input.method)) throw new Error("unknown service method");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.servedOn) || Number.isNaN(Date.parse(input.servedOn))) throw new Error("invalid service date");
  if (input.servedOn > nairobiDate(new Date())) throw new Error("service date cannot be in the future");

  const admin = createAdminClient();
  const { data: c, error } = await admin
    .from("cases")
    .select("id,case_number,stage,advocate_id,advocates(phone)")
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case: ${error.message}`);
  if (!c.advocate_id) throw new Error("link the advocate to the roll before notifying");
  if (c.stage !== "screening" && c.stage !== "advocate_notified") throw new Error(`cannot notify at stage ${c.stage}`);

  const cfg = await loadWorkflowConfig();
  const dueDate = new Date(`${input.servedOn}T23:59:59+03:00`);
  dueDate.setUTCDate(dueDate.getUTCDate() + cfg.advocateResponseDays);
  const responseDue = nairobiDate(dueDate);

  // Mark notified first, so the stage-change event below is visible on the advocate's timeline.
  const { error: upErr } = await admin
    .from("cases")
    .update({
      advocate_notified_at: new Date().toISOString(),
      advocate_served_on: input.servedOn,
      advocate_service_method: input.method,
    })
    .eq("id", caseId);
  if (upErr) throw new Error(`record service: ${upErr.message}`);

  if (input.shareDocumentIds.length) {
    const { error: shErr } = await admin
      .from("documents")
      .update({ shared_with_advocate: true })
      .eq("case_id", caseId)
      .eq("visibility", "parties")
      .in("id", input.shareDocumentIds);
    if (shErr) throw new Error(`share documents: ${shErr.message}`);
  }

  const activationCode = await createActivation(caseId, c.advocate_id, actorId(actor));
  await meetDeadlines(caseId, "advocate_response");
  await addDeadline(caseId, "advocate_response", dueDate);

  if (c.stage === "screening") {
    const r = await changeStageAs(actor, caseId, "screening", "advocate_notified");
    if (!r.ok) throw new Error(`stage change failed: ${r.reason}`);
  }
  const { error: evErr } = await admin.from("case_events").insert({
    case_id: caseId,
    type: "advocate_notified",
    visibility: "parties",
    advocate_visible: true,
    actor_id: actorId(actor),
    body: { served_on: input.servedOn, method: input.method, response_due: responseDue },
  });
  if (evErr) throw new Error(`notified event: ${evErr.message}`);

  const rollPhone = (c.advocates as unknown as { phone: string | null } | null)?.phone;
  if (rollPhone) {
    try {
      await getSmsProvider().send(rollPhone, smsText.advocateNotified("en", c.case_number, responseDue));
    } catch (e) {
      await admin.from("case_events").insert({ case_id: caseId, type: "sms_failed", visibility: "internal", body: { error: String(e), to: "advocate" } });
    }
  }
  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "notify_advocate",
    entity: "cases",
    entityId: caseId,
    details: { served_on: input.servedOn, method: input.method, shared: input.shareDocumentIds.length, response_due: responseDue },
  });
  return { activationCode, responseDue };
}
