import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Outcome } from "./outcomes";

export interface PartyHearing {
  starts_at: string;
  duration_minutes: number;
  mode: "in_person" | "online";
  venue: string | null;
  online_link: string | null;
}

export interface PartyDecision {
  id: string;
  outcome: Outcome;
  reasons: string;
  orders: string | null;
  amount_kes: number | null;
  decided_at: string;
}

/**
 * What the complainant and the notified advocate may see of the Commission's work: the next scheduled hearing
 * (no panel, no minutes) and the current decision. Callers must already have verified the viewer is a party
 * (RLS-scoped my_cases / advocate_cases lookup); hearings and decisions are not readable by parties directly.
 */
export async function partyHearingAndDecision(caseId: string): Promise<{ hearing: PartyHearing | null; decision: PartyDecision | null }> {
  const admin = createAdminClient();
  const [{ data: hearing }, { data: decision }] = await Promise.all([
    admin
      .from("hearings")
      .select("starts_at,duration_minutes,mode,venue,online_link")
      .eq("case_id", caseId)
      .eq("status", "scheduled")
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    admin
      .from("decisions")
      .select("id,outcome,reasons,orders,amount_kes,decided_at")
      .eq("case_id", caseId)
      .is("superseded_by", null)
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { hearing: (hearing as PartyHearing | null) ?? null, decision: (decision as PartyDecision | null) ?? null };
}
