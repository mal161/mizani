import { logAudit } from "@/lib/audit";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { setCategoryPriorityAs, type Priority } from "@/lib/cases/actions";
import { latestAi } from "./triage";

/**
 * A person accepts the latest AI triage suggestion: its category and priority are applied through the
 * normal triage action (timeline event + audit), and the acceptance itself is audited.
 */
export async function applyAiSuggestionAs(actor: StaffUser, caseId: string): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  const row = await latestAi(caseId, "triage");
  const out = row?.status === "ok" ? (row.output as { category?: string; priority?: string } | null) : null;
  if (!out?.category || !out.priority) throw new Error("no AI suggestion to apply");
  await setCategoryPriorityAs(actor, caseId, out.category, out.priority as Priority);
  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "ai_suggestion_applied",
    entity: "cases",
    entityId: caseId,
    details: { ai_output_id: row!.id, category: out.category, priority: out.priority },
  });
}
