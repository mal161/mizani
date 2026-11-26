import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { buildDecisionLetter } from "./decision-letter";
import { buildCaseBundle } from "./bundle";

export const REFERRAL_STATUSES = ["prepared", "lodged", "acknowledged", "concluded"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Officers and admins track the referral at the Disciplinary Tribunal. */
export async function updateReferralAs(
  actor: StaffUser,
  referralId: string,
  input: { status: ReferralStatus; tribunalReference?: string },
): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  if (!(REFERRAL_STATUSES as readonly string[]).includes(input.status)) throw new Error("unknown referral status");
  const admin = createAdminClient();
  const { data: before } = await admin.from("referrals").select("case_id,status,tribunal_reference").eq("id", referralId).maybeSingle();
  if (!before) throw new Error("referral not found");
  const ref = input.tribunalReference?.trim().slice(0, 80) || before.tribunal_reference;
  const { error } = await admin
    .from("referrals")
    .update({ status: input.status, tribunal_reference: ref, updated_by: actorId(actor) })
    .eq("id", referralId);
  if (error) throw new Error(`update referral: ${error.message}`);
  await admin.from("case_events").insert({
    case_id: before.case_id,
    type: "referral_updated",
    visibility: "internal",
    actor_id: actorId(actor),
    body: { status: input.status, tribunal_reference: ref },
  });
  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "update_referral",
    entity: "cases",
    entityId: before.case_id,
    details: { referral_id: referralId, before: { status: before.status, ref: before.tribunal_reference }, after: { status: input.status, ref } },
  });
}

/** Decision letter followed by the full case bundle, for lodging with the Tribunal. */
export async function buildReferralPack(referralId: string): Promise<{ pdf: Uint8Array; caseNumber: string }> {
  const admin = createAdminClient();
  const { data: r } = await admin.from("referrals").select("case_id,decision_id,cases(case_number)").eq("id", referralId).single();
  const out = await PDFDocument.create();
  for (const part of [await buildDecisionLetter(r!.decision_id), await buildCaseBundle(r!.case_id)]) {
    const src = await PDFDocument.load(part);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return { pdf: await out.save(), caseNumber: (r!.cases as unknown as { case_number: string }).case_number };
}
