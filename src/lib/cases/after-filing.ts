import { createAdminClient } from "@/lib/supabase/admin";
import { triageCase } from "@/lib/ai/triage";
import { routeCase } from "./routing";
import { openStageDeadline } from "./deadlines";

async function recordFailure(caseId: string, type: string, e: unknown) {
  await createAdminClient()
    .from("case_events")
    .insert({ case_id: caseId, type, visibility: "internal", body: { error: String(e) } });
}

/**
 * Runs after any new filing (online or walk-in): automatic routing, the first stage deadline,
 * and an AI triage suggestion (when AI is on). Failures are recorded on the case and never undo the filing.
 */
export async function afterFiling(caseId: string): Promise<void> {
  try {
    await routeCase(caseId);
  } catch (e) {
    await recordFailure(caseId, "routing_failed", e);
  }
  await openStageDeadline(caseId, "received");
  try {
    await triageCase(caseId);
  } catch (e) {
    await recordFailure(caseId, "ai_failed", e);
  }
}
