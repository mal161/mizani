/**
 * Staff case actions. Each `*As(actor, ...)` function trusts that `actor` was authorised by the caller
 * (server actions call assertStaff() first) and writes with the service role.
 */
import en from "../../../messages/en.json";
import sw from "../../../messages/sw.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider } from "@/lib/sms";
import { logAudit } from "@/lib/audit";
import { actorId, ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import type { Locale } from "@/i18n/routing";
import { smsText } from "./messages";
import { isStage, type Stage } from "./stages";
import { allowedNextStages, labelFor } from "./workflow-config";
import { loadWorkflowConfig } from "./load-workflow";
import { addDeadline, openStageDeadline } from "./deadlines";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ChangeStageResult = { ok: true } | { ok: false; reason: "not_allowed" | "stale" | "reason_required" };

const stageNames: Record<Locale, Record<Stage, string>> = { en: en.stages, sw: sw.stages };

async function event(caseId: string, actor: StaffUser, type: string, visibility: "parties" | "internal", body: object) {
  const { error } = await createAdminClient()
    .from("case_events")
    .insert({ case_id: caseId, type, visibility, actor_id: actorId(actor), body });
  if (error) throw new Error(`${type} event: ${error.message}`);
}

/** Attributes a staff change to the officer in the immutable audit log (DB triggers only see the service role). */
async function auditAction(actor: StaffUser, action: string, caseId: string, details: Record<string, unknown> = {}) {
  await logAudit({ actorId: actorId(actor), channel: actor.id === "system" ? "system" : "web", action, entity: "cases", entityId: caseId, details });
}

async function caseForSms(caseId: string) {
  const { data, error } = await createAdminClient()
    .from("cases")
    .select("case_number,language,complainant:profiles!cases_complainant_id_fkey(phone)")
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case: ${error.message}`);
  const complainant = data.complainant as unknown as { phone: string | null } | null;
  return { caseNumber: data.case_number as string, language: data.language as Locale, phone: complainant?.phone ?? null };
}

/** Texts the complainant; an SMS failure is recorded internally and never undoes the action. */
async function notifyComplainant(caseId: string, message: (l: Locale, caseNumber: string) => string) {
  const c = await caseForSms(caseId);
  if (!c.phone) return;
  try {
    await getSmsProvider().send(c.phone, message(c.language, c.caseNumber));
  } catch (e) {
    await createAdminClient()
      .from("case_events")
      .insert({ case_id: caseId, type: "sms_failed", visibility: "internal", body: { error: String(e) } });
  }
}

export async function changeStageAs(
  actor: StaffUser,
  caseId: string,
  from: Stage,
  to: Stage,
  reason?: string,
): Promise<ChangeStageResult> {
  const cfg = await loadWorkflowConfig();
  if (!allowedNextStages(from, cfg).includes(to)) return { ok: false, reason: "not_allowed" };
  const why = reason?.trim() || null;
  if (to === "closed" && !why) return { ok: false, reason: "reason_required" };

  const { data: applied, error } = await createAdminClient().rpc("transition_case_stage", {
    p_case_id: caseId,
    p_from: from,
    p_to: to,
    p_actor: actorId(actor),
    p_reason: why,
  });
  if (error) throw new Error(`transition: ${error.message}`);
  if (!applied) return { ok: false, reason: "stale" };
  await auditAction(actor, "change_stage", caseId, { from, to, reason: why });

  await openStageDeadline(caseId, to);
  await notifyComplainant(caseId, (l, n) =>
    smsText.statusChanged(l, n, labelFor(to, l, cfg, (s) => stageNames[l][s])),
  );
  return { ok: true };
}

export async function addNoteAs(actor: StaffUser, caseId: string, text: string): Promise<void> {
  const t = text.trim();
  if (t.length < 1 || t.length > 5000) throw new Error("note must be 1-5000 characters");
  await event(caseId, actor, "note", "internal", { text: t });
  await auditAction(actor, "add_note", caseId);
}

export async function assignCaseAs(actor: StaffUser, caseId: string, officerId: string | null): Promise<void> {
  const admin = createAdminClient();
  if (officerId) {
    const { data } = await admin.from("profiles").select("role").eq("id", officerId).maybeSingle();
    if (!data || !["staff", "admin"].includes(data.role)) throw new Error("assignee must be staff or admin");
  }
  const { error } = await admin.from("cases").update({ assigned_officer_id: officerId }).eq("id", caseId);
  if (error) throw new Error(`assign: ${error.message}`);
  await event(caseId, actor, "assigned", "internal", { officer_id: officerId, auto: actor.id === "system" });
  await auditAction(actor, "assign_case", caseId, { officer_id: officerId });
}

export async function setCategoryPriorityAs(
  actor: StaffUser,
  caseId: string,
  category: string | null,
  priority: Priority,
): Promise<void> {
  const cfg = await loadWorkflowConfig();
  if (category !== null && !cfg.categories.includes(category)) throw new Error(`unknown category ${category}`);
  if (!PRIORITIES.includes(priority)) throw new Error(`unknown priority ${priority}`);
  const { error } = await createAdminClient().from("cases").update({ category, priority }).eq("id", caseId);
  if (error) throw new Error(`triage: ${error.message}`);
  await event(caseId, actor, "triaged", "internal", { category, priority });
  await auditAction(actor, "triage_case", caseId, { category, priority });
  // Triage can change which rule applies: route again if nobody has the case yet.
  const { data } = await createAdminClient().from("cases").select("assigned_officer_id").eq("id", caseId).single();
  if (!data?.assigned_officer_id) {
    const { routeCase } = await import("./routing");
    await routeCase(caseId);
  }
}

export async function requestInfoAs(actor: StaffUser, caseId: string, message: string, dueDays: number): Promise<void> {
  const m = message.trim();
  if (m.length < 5 || m.length > 2000) throw new Error("request must be 5-2000 characters");
  if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 60) throw new Error("due days must be 1-60");
  const dueAt = new Date(Date.now() + dueDays * 86_400_000);
  await event(caseId, actor, "info_requested", "parties", { message: m, due_at: dueAt.toISOString() });
  await addDeadline(caseId, "info_request", dueAt);
  await auditAction(actor, "request_info", caseId, { due_at: dueAt.toISOString() });
  await notifyComplainant(caseId, smsText.infoRequested);
}

export { isStage, PRIORITIES };

/** Links the case to a roll entry (when the complainant's advocate name was not matched at filing). */
export async function linkAdvocateAs(actor: StaffUser, caseId: string, advocateId: string): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  const admin = createAdminClient();
  const { data: roll } = await admin.from("advocates").select("id,full_name").eq("id", advocateId).maybeSingle();
  if (!roll) throw new Error("advocate not on the roll");
  const { data: before } = await admin.from("cases").select("advocate_id,advocate_notified_at").eq("id", caseId).single();
  // Relinking after service would show the allegations to an advocate who was never served.
  if (before?.advocate_notified_at) throw new Error("the advocate has already been notified; relinking is not allowed");
  const { error } = await admin.from("cases").update({ advocate_id: advocateId }).eq("id", caseId);
  if (error) throw new Error(`link advocate: ${error.message}`);
  await event(caseId, actor, "advocate_linked", "internal", { advocate_id: advocateId, name: roll.full_name });
  await auditAction(actor, "link_advocate", caseId, { before: before?.advocate_id ?? null, after: advocateId });
}

/** Shares (or stops sharing) a complainant-side document with the advocate. Internal documents can't be shared. */
export async function setDocumentSharedAs(actor: StaffUser, documentId: string, shared: boolean): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  const admin = createAdminClient();
  const { data: doc } = await admin.from("documents").select("case_id,visibility").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("document not found");
  if (shared && doc.visibility === "internal") throw new Error("internal documents cannot be shared");
  const { error } = await admin.from("documents").update({ shared_with_advocate: shared }).eq("id", documentId);
  if (error) throw new Error(`share document: ${error.message}`);
  await auditAction(actor, shared ? "share_document" : "unshare_document", doc.case_id, { document_id: documentId });
}
