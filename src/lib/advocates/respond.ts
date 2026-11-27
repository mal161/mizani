import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { realFiles, validateEvidence } from "@/lib/cases/schema";
import { ComplaintValidationError } from "@/lib/cases/file-complaint";
import { uploadEvidence } from "@/lib/cases/evidence";
import { meetDeadlines } from "@/lib/cases/deadlines";

/** Same rule as the SQL is_my_advocate_case(): the case was notified and is against this user's roll entry. */
export async function isAdvocateCase(userId: string, caseId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: c }, { data: p }] = await Promise.all([
    admin.from("cases").select("advocate_notified_at,advocates(profile_id)").eq("id", caseId).maybeSingle(),
    admin.from("profiles").select("role,active").eq("id", userId).maybeSingle(),
  ]);
  const linked = (c?.advocates as unknown as { profile_id: string | null } | null)?.profile_id;
  return Boolean(c?.advocate_notified_at && linked === userId && p?.role === "advocate" && p.active);
}

/**
 * The advocate's written response (with optional documents). Text is stored where complainants cannot read it;
 * the timeline only says a response arrived. The first response meets the deadline; later ones are supplementary.
 */
export async function submitAdvocateResponse(
  userId: string,
  caseId: string,
  text: string,
  files: File[],
): Promise<{ late: boolean; documentIds: string[] }> {
  if (!(await isAdvocateCase(userId, caseId))) throw new Error("not your case");
  const body = text.trim();
  if (body.length < 20 || body.length > 20000) throw new ComplaintValidationError("invalid_input", ["text"]);
  const evidenceError = validateEvidence(files);
  if (evidenceError) throw new ComplaintValidationError(evidenceError);
  const evidence = realFiles(files);
  const admin = createAdminClient();

  const { data: deadline } = await admin
    .from("case_deadlines")
    .select("due_at")
    .eq("case_id", caseId)
    .eq("kind", "advocate_response")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const late = deadline ? Date.now() > new Date(deadline.due_at).getTime() : false;

  // Advocate documents are internal: staff and the uploading advocate see them, the complainant does not.
  const documentIds = await uploadEvidence(caseId, evidence, userId, "internal");
  const { error } = await admin.from("advocate_responses").insert({ case_id: caseId, advocate_profile_id: userId, text: body, late });
  if (error) throw new Error(`store response: ${error.message}`);
  const { error: evErr } = await admin.from("case_events").insert({
    case_id: caseId,
    type: "advocate_responded",
    visibility: "parties",
    advocate_visible: true,
    actor_id: userId,
    body: { late, documents: evidence.length },
  });
  if (evErr) throw new Error(`responded event: ${evErr.message}`);
  await meetDeadlines(caseId, "advocate_response");

  const { data: c } = await admin.from("cases").select("assigned_officer_id").eq("id", caseId).single();
  if (c?.assigned_officer_id) {
    await admin.from("notifications").insert({ user_id: c.assigned_officer_id, case_id: caseId, kind: "advocate_responded" });
  }
  await logAudit({ actorId: userId, channel: "web", action: "advocate_response", entity: "cases", entityId: caseId, details: { late, documents: evidence.length } });
  return { late, documentIds };
}
