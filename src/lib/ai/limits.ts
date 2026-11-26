import { createAdminClient } from "@/lib/supabase/admin";

/** Manual AI runs (re-run triage, summarize) allowed per case per kind per hour. Automatic triage on filing is not counted. */
export const AI_RERUN_LIMIT = 3;
/** Online filings allowed per complainant per rolling 24 hours (each filing triggers one paid AI call). */
export const FILINGS_PER_DAY = 5;

export async function aiRateLimited(caseId: string, kind: "triage" | "case_summary"): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await createAdminClient()
    .from("ai_outputs")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("kind", kind)
    .not("created_by", "is", null)
    .gte("created_at", since);
  return (count ?? 0) >= AI_RERUN_LIMIT;
}

/** True when this complainant may file another complaint online today. */
export async function checkFilingLimit(complainantId: string): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await createAdminClient()
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("complainant_id", complainantId)
    .eq("channel", "online")
    .gte("created_at", since);
  return (count ?? 0) < FILINGS_PER_DAY;
}
