import { createAdminClient } from "@/lib/supabase/admin";
import { triageCase } from "@/lib/ai/triage";
import { routeCase } from "./routing";
import { openStageDeadline } from "./deadlines";

/** Runs a task now or later. Server actions pass `after` from next/server so slow work never delays the response. */
export type Scheduler = (task: () => Promise<void>) => void | Promise<void>;
const runNow: Scheduler = (task) => task();

async function recordFailure(caseId: string, type: string, e: unknown) {
  await createAdminClient()
    .from("case_events")
    .insert({ case_id: caseId, type, visibility: "internal", body: { error: String(e) } });
}

/**
 * Runs after any new filing (online or walk-in): automatic routing and the first stage deadline now, and an
 * AI triage suggestion (when AI is on) through `schedule`, so a slow or failing AI call can never cost the
 * complainant their case number and PIN. Failures are recorded on the case and never undo the filing.
 */
export async function afterFiling(caseId: string, schedule: Scheduler = runNow): Promise<void> {
  try {
    await routeCase(caseId);
  } catch (e) {
    await recordFailure(caseId, "routing_failed", e);
  }
  await openStageDeadline(caseId, "received");
  await schedule(async () => {
    try {
      await triageCase(caseId);
    } catch (e) {
      await recordFailure(caseId, "ai_failed", e);
    }
  });
}
