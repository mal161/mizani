import { createAdminClient } from "@/lib/supabase/admin";

export interface CaseFlags {
  /** Other cases by the same complainant against the same advocate within 90 days. */
  possible_duplicates: { case_number: string; created_at: string }[];
  /** All complaints against this roll advocate; null when the advocate isn't matched to the roll. */
  advocate_history: { total: number; open: number; closed: number; last_12_months: number } | null;
}

/** Database-derived flags for staff (no AI). Callers must already be authorised staff. */
export async function caseFlags(caseId: string): Promise<CaseFlags> {
  const { data, error } = await createAdminClient().rpc("case_flags", { p_case_id: caseId });
  if (error) throw new Error(`case flags: ${error.message}`);
  return (data as CaseFlags | null) ?? { possible_duplicates: [], advocate_history: null };
}
