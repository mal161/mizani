import { createAdminClient } from "@/lib/supabase/admin";
import { realFiles, validateEvidence } from "./schema";
import { ComplaintValidationError } from "./file-complaint";
import { uploadEvidence } from "./evidence";
import { meetDeadlines } from "./deadlines";

export interface OpenInfoRequest {
  eventId: string;
  message: string;
  dueAt: string | null;
}

/** The latest information request that has not been answered since it was made, or null. */
export async function openInfoRequest(caseId: string): Promise<OpenInfoRequest | null> {
  const { data } = await createAdminClient()
    .from("case_events")
    .select("id,type,body,created_at")
    .eq("case_id", caseId)
    .in("type", ["info_requested", "info_provided"])
    .order("created_at", { ascending: false })
    .limit(1);
  const last = data?.[0];
  if (!last || last.type !== "info_requested") return null;
  const body = last.body as { message?: string; due_at?: string };
  return { eventId: last.id, message: body.message ?? "", dueAt: body.due_at ?? null };
}

/** The case's own complainant answers the open request (text + optional evidence). */
/** Returns the uploaded documents' ids (for OCR). */
export async function respondToInfoRequest(caseId: string, userId: string, text: string, files: File[]): Promise<string[]> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("cases").select("complainant_id,assigned_officer_id").eq("id", caseId).maybeSingle();
  if (!c || c.complainant_id !== userId) throw new Error("not your case");
  if (!(await openInfoRequest(caseId))) throw new Error("no open information request");

  const answer = text.trim();
  if (answer.length < 1 || answer.length > 5000) throw new ComplaintValidationError("invalid_input", ["text"]);
  const evidenceError = validateEvidence(files);
  if (evidenceError) throw new ComplaintValidationError(evidenceError);
  const evidence = realFiles(files);

  const documentIds = await uploadEvidence(caseId, evidence, userId);
  const { error } = await admin.from("case_events").insert({
    case_id: caseId,
    type: "info_provided",
    visibility: "parties",
    actor_id: userId,
    body: { text: answer, documents: evidence.length },
  });
  if (error) throw new Error(`info_provided event: ${error.message}`);
  await meetDeadlines(caseId, "info_request");
  if (c.assigned_officer_id) {
    await admin.from("notifications").insert({ user_id: c.assigned_officer_id, case_id: caseId, kind: "info_provided" });
  }
  return documentIds;
}
