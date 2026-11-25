import { createAdminClient } from "@/lib/supabase/admin";
import { routeCase } from "./routing";
import { openStageDeadline } from "./deadlines";

/**
 * Runs after any new filing (online or walk-in): automatic routing and the first stage deadline.
 * Failures are recorded on the case and never undo the filing.
 */
export async function afterFiling(caseId: string): Promise<void> {
  try {
    await routeCase(caseId);
  } catch (e) {
    await createAdminClient()
      .from("case_events")
      .insert({ case_id: caseId, type: "routing_failed", visibility: "internal", body: { error: String(e) } });
  }
  await openStageDeadline(caseId, "received");
}
