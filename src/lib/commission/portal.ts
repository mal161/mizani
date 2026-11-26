import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { hearingsBetween, type HearingRow } from "./hearings";
import type { Outcome } from "./outcomes";

/** Commissioners see their own panels; admins see every panel. */
const panelFilter = (user: StaffUser) => (user.role === "commissioner" ? user.id : undefined);

export async function upcomingHearings(user: StaffUser, days = 30): Promise<HearingRow[]> {
  const now = new Date();
  const rows = await hearingsBetween(now, new Date(now.getTime() + days * 86400_000), panelFilter(user));
  return rows.filter((h) => h.status === "scheduled");
}

export interface AwaitingRow {
  case_id: string;
  case_number: string;
  summary: string;
  held_at: string;
}

/** Cases still at stage "hearing" whose hearing has been held (minutes recorded) — a decision is due. */
export async function awaitingDecision(user: StaffUser): Promise<AwaitingRow[]> {
  let q = createAdminClient()
    .from("hearings")
    .select("case_id,starts_at,panel,cases!inner(case_number,summary,stage)")
    .eq("status", "held")
    .eq("cases.stage", "hearing")
    .order("starts_at", { ascending: false })
    .limit(100);
  const mine = panelFilter(user);
  if (mine) q = q.contains("panel", [mine]);
  const { data } = await q;
  const seen = new Set<string>();
  const out: AwaitingRow[] = [];
  for (const h of data ?? []) {
    if (seen.has(h.case_id)) continue;
    seen.add(h.case_id);
    const c = h.cases as unknown as { case_number: string; summary: string };
    out.push({ case_id: h.case_id, case_number: c.case_number, summary: c.summary, held_at: h.starts_at });
  }
  return out;
}

export interface DecidedRow {
  id: string;
  case_number: string;
  outcome: Outcome;
  decided_at: string;
}

export async function recentlyDecided(user: StaffUser, limit = 10): Promise<DecidedRow[]> {
  let q = createAdminClient()
    .from("decisions")
    .select("id,outcome,decided_at,panel,cases(case_number)")
    .is("superseded_by", null)
    .order("decided_at", { ascending: false })
    .limit(limit);
  const mine = panelFilter(user);
  if (mine) q = q.contains("panel", [mine]);
  const { data } = await q;
  return (data ?? []).map((d) => ({
    id: d.id,
    outcome: d.outcome as Outcome,
    decided_at: d.decided_at,
    case_number: (d.cases as unknown as { case_number: string }).case_number,
  }));
}

/** Active commissioners (and admins, who may sit on panels in small offices) for panel pickers and names. */
export async function panelMembers(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id,full_name,role")
    .in("role", ["commissioner", "admin"])
    .eq("active", true)
    .order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.id.slice(0, 8) }));
}

/** Monday 00:00 Africa/Nairobi of the week containing `day` (YYYY-MM-DD, Nairobi), as a UTC Date. */
export function weekStart(day?: string | null): Date {
  const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00+03:00`) : new Date();
  if (Number.isNaN(base.getTime())) return weekStart(null);
  const nairobi = new Date(base.getTime() + 3 * 3600_000);
  const dow = (nairobi.getUTCDay() + 6) % 7; // Monday = 0
  const ymd = new Date(Date.UTC(nairobi.getUTCFullYear(), nairobi.getUTCMonth(), nairobi.getUTCDate() - dow));
  return new Date(ymd.getTime() - 3 * 3600_000);
}

export const nairobiDay = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
