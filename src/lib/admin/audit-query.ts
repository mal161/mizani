import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import { toCsv as csvTable } from "@/lib/csv";

export interface AuditFilters {
  caseNumber?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_channel: string;
  action: string;
  entity: string;
  entity_id: string;
  details: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function filtersFrom(sp: Record<string, string | undefined>): AuditFilters {
  return {
    caseNumber: sp.caseNumber?.trim() || undefined,
    actor: sp.actor?.trim() || undefined,
    action: sp.action?.trim().slice(0, 60) || undefined,
    from: sp.from && DATE.test(sp.from) ? sp.from : undefined,
    to: sp.to && DATE.test(sp.to) ? sp.to : undefined,
  };
}

/**
 * Runs the filtered audit query on the caller's (admin, RLS-scoped) client for rows [from, to].
 * A filter that cannot match anything (e.g. unknown case number) yields no rows.
 * (Returns results, not the builder: a Supabase builder is thenable and would run when returned from async.)
 */
export async function auditQuery(
  supabase: SupabaseClient,
  f: AuditFilters,
  from: number,
  to: number,
): Promise<{ rows: AuditRow[]; count: number }> {
  const none = { rows: [], count: 0 };
  let q = supabase.from("audit_log").select("id,at,actor_id,actor_channel,action,entity,entity_id,details", { count: "exact" });
  if (f.caseNumber) {
    const n = parseCaseNumberInput(f.caseNumber);
    if (!n) return none;
    const { data: c } = await supabase.from("staff_cases").select("id").eq("case_number", n).maybeSingle();
    if (!c) return none;
    q = q.or(`entity_id.eq.${c.id},details->>case_id.eq.${c.id}`);
  }
  if (f.actor) {
    if (!UUID.test(f.actor)) return none;
    q = q.eq("actor_id", f.actor);
  }
  if (f.action) q = q.eq("action", f.action);
  if (f.from) q = q.gte("at", `${f.from}T00:00:00+03:00`);
  if (f.to) q = q.lte("at", `${f.to}T23:59:59.999+03:00`);
  const { data, count, error } = await q.order("at", { ascending: false }).range(from, to);
  if (error) throw new Error(`audit query: ${error.message}`);
  return { rows: (data ?? []) as AuditRow[], count: count ?? 0 };
}

export function toCsv(rows: AuditRow[]): string {
  return csvTable(
    ["id", "at", "actor_id", "channel", "action", "entity", "entity_id", "details"],
    rows.map((r) => [r.id, r.at, r.actor_id, r.actor_channel, r.action, r.entity, r.entity_id, r.details]),
  );
}
