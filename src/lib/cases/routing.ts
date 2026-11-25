import { createAdminClient } from "@/lib/supabase/admin";
import { SYSTEM_ACTOR } from "@/lib/auth/staff-types";
import { assignCaseAs } from "./actions";

export interface RoutingRule {
  id: string;
  position: number;
  category: string | null;
  priority: string | null;
  office: string | null;
  officer_ids: string[];
  active: boolean;
}

interface RoutableCase {
  category: string | null;
  priority: string;
  office: string | null;
}

function leastLoaded(pool: string[], openCounts: Map<string, number>): string | null {
  let best: string | null = null;
  for (const id of pool) {
    if (best === null || (openCounts.get(id) ?? 0) < (openCounts.get(best) ?? 0)) best = id;
  }
  return best;
}

/**
 * First active rule (lowest position) whose non-null fields all match the case; within its pool,
 * the active officer with the fewest open cases. No matching rule (or an empty pool) → least-loaded
 * of all active staff. Nobody available → null.
 */
export function pickOfficer(
  c: RoutableCase,
  rules: RoutingRule[],
  openCounts: Map<string, number>,
  activeStaff: string[],
): string | null {
  const active = new Set(activeStaff);
  const matching = rules
    .filter((r) => r.active)
    .sort((a, b) => a.position - b.position)
    .find(
      (r) =>
        (r.category === null || r.category === c.category) &&
        (r.priority === null || r.priority === c.priority) &&
        (r.office === null || r.office === c.office),
    );
  if (matching) {
    const pool = matching.officer_ids.filter((id) => active.has(id));
    const chosen = leastLoaded(pool, openCounts);
    if (chosen) return chosen;
  }
  return leastLoaded(activeStaff, openCounts);
}

/** Assigns the case automatically. Returns the officer id, or null (case stays in the unassigned queue). */
export async function routeCase(caseId: string): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: c, error: cErr }, { data: rules }, { data: staff }] = await Promise.all([
    admin.from("cases").select("category,priority,office").eq("id", caseId).single(),
    admin.from("routing_rules").select("id,position,category,priority,office,officer_ids,active"),
    admin.from("profiles").select("id").in("role", ["staff"]).eq("active", true).order("created_at"),
  ]);
  if (cErr) throw new Error(`route: ${cErr.message}`);
  // Automatic routing only considers active officers (role staff); admins can be assigned by hand.
  const activeStaff = (staff ?? []).map((s) => s.id as string);

  const { data: open } = await admin
    .from("cases")
    .select("assigned_officer_id")
    .neq("stage", "closed")
    .not("assigned_officer_id", "is", null);
  const counts = new Map<string, number>();
  for (const row of open ?? []) {
    const id = row.assigned_officer_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const officer = pickOfficer(c, (rules ?? []) as RoutingRule[], counts, activeStaff);
  if (officer) await assignCaseAs(SYSTEM_ACTOR, caseId, officer);
  return officer;
}
