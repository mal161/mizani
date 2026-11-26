import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { setCategoryPriorityAs, type Priority } from "@/lib/cases/actions";

/**
 * A person accepts the AI triage suggestion they were shown (by id, so a newer re-run can't be applied unseen):
 * its category and priority go through the normal triage action (timeline event + audit), and the acceptance
 * itself is audited.
 */
export async function applyAiSuggestionAs(actor: StaffUser, caseId: string, aiOutputId: string): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  const { data: row } = await createAdminClient()
    .from("ai_outputs")
    .select("id,case_id,kind,status,output")
    .eq("id", aiOutputId)
    .maybeSingle();
  if (!row || row.case_id !== caseId || row.kind !== "triage") throw new Error("AI suggestion does not belong to this case");
  const out = row.status === "ok" ? (row.output as { category?: string; priority?: string } | null) : null;
  if (!out?.category || !out.priority) throw new Error("no AI suggestion to apply");
  await setCategoryPriorityAs(actor, caseId, out.category, out.priority as Priority);
  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "ai_suggestion_applied",
    entity: "cases",
    entityId: caseId,
    details: { ai_output_id: row.id, category: out.category, priority: out.priority },
  });
}
