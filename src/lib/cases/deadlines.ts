import { createAdminClient } from "@/lib/supabase/admin";
import type { Stage } from "./stages";
import { slaDaysFor } from "./workflow-config";
import { loadWorkflowConfig } from "./load-workflow";

export type DeadlineKind = "stage" | "info_request" | "advocate_response";

const DAY_MS = 86_400_000;
const DUE_SOON_MS = 48 * 3600_000;

export async function addDeadline(caseId: string, kind: DeadlineKind, dueAt: Date, stage?: Stage): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("case_deadlines")
    .insert({ case_id: caseId, kind, stage: stage ?? null, due_at: dueAt.toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`add deadline: ${error.message}`);
  return data.id as string;
}

export async function meetDeadlines(caseId: string, kind: DeadlineKind): Promise<void> {
  const { error } = await createAdminClient()
    .from("case_deadlines")
    .update({ met_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("kind", kind)
    .is("met_at", null);
  if (error) throw new Error(`meet deadlines: ${error.message}`);
}

/** Closes any open stage deadline and opens one for `stage` using its SLA (none for closed). */
export async function openStageDeadline(caseId: string, stage: Stage): Promise<void> {
  await meetDeadlines(caseId, "stage");
  const days = slaDaysFor(stage, await loadWorkflowConfig());
  if (days === null) return;
  await addDeadline(caseId, "stage", new Date(Date.now() + days * DAY_MS), stage);
}

/**
 * Creates due-soon (≤48h left) and overdue notifications for unmet deadlines: to the assigned officer,
 * or to all active admins when nobody is assigned. Idempotent per (deadline, user, kind).
 * `caseId` limits the sweep to one case (tests).
 */
export async function sweepDeadlines(
  now: Date,
  opts: { caseId?: string } = {},
): Promise<{ dueSoon: number; overdue: number }> {
  const admin = createAdminClient();
  let q = admin
    .from("case_deadlines")
    .select("id,case_id,due_at,cases!inner(assigned_officer_id,stage)")
    .is("met_at", null)
    .lte("due_at", new Date(now.getTime() + DUE_SOON_MS).toISOString())
    .neq("cases.stage", "closed");
  if (opts.caseId) q = q.eq("case_id", opts.caseId);
  const { data: rows, error } = await q;
  if (error) throw new Error(`sweep: ${error.message}`);
  if (!rows?.length) return { dueSoon: 0, overdue: 0 };

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("active", true);
  const adminIds = (admins ?? []).map((a) => a.id as string);

  const inserts: { user_id: string; case_id: string; deadline_id: string; kind: "due_soon" | "overdue" }[] = [];
  let dueSoon = 0;
  let overdue = 0;
  for (const r of rows) {
    const kind = new Date(r.due_at).getTime() < now.getTime() ? "overdue" : "due_soon";
    if (kind === "overdue") overdue++;
    else dueSoon++;
    const c = r.cases as unknown as { assigned_officer_id: string | null };
    const recipients = c.assigned_officer_id ? [c.assigned_officer_id] : adminIds;
    for (const user_id of recipients) inserts.push({ user_id, case_id: r.case_id, deadline_id: r.id, kind });
  }
  if (inserts.length) {
    const { error: insErr } = await admin
      .from("notifications")
      .upsert(inserts, { onConflict: "deadline_id,user_id,kind", ignoreDuplicates: true });
    if (insErr) throw new Error(`notify: ${insErr.message}`);
  }
  return { dueSoon, overdue };
}
