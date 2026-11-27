import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/ai/document-text";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { getOcrProvider, OcrError } from "./index";
import { logAudit } from "@/lib/audit";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";

/** Reads per document before it stays `failed` (the cron retries until then). */
export const MAX_OCR_ATTEMPTS = 3;
/** Documents read per cron run, one after another (keeps the run well inside the function time limit). */
export const OCR_SWEEP_BATCH = 5;

export type OcrRunStatus = "done" | "failed" | "skipped" | "pending" | "off";

async function ocrActive(): Promise<boolean> {
  if (!getOcrProvider()) return false;
  return (await loadWorkflowConfig()).ocrEnabled;
}

/**
 * Reads one uploaded document through the OCR provider and stores the result in document_texts.
 * PDFs that already have a text layer are `skipped`. Never throws: every failure is recorded with a short code.
 * Returns "off" (and writes nothing) when OCR is switched off or not configured.
 */
export async function runOcr(documentId: string): Promise<OcrRunStatus> {
  try {
    if (!(await ocrActive())) return "off";
    const provider = getOcrProvider()!;
    const admin = createAdminClient();

    const { data: claimed, error: claimErr } = await admin.rpc("claim_document_text", {
      p_document_id: documentId,
      p_max_attempts: MAX_OCR_ATTEMPTS,
    });
    if (claimErr) throw new Error(`claim: ${claimErr.message}`);
    if (!claimed) {
      // Already read, out of attempts, or another reader has it right now.
      const { data } = await admin.from("document_texts").select("status").eq("document_id", documentId).maybeSingle();
      return (data?.status as OcrRunStatus | undefined) ?? "pending";
    }

    const finish = async (fields: Record<string, unknown>) => {
      await admin.from("document_texts").update({ ...fields, claimed_at: null }).eq("document_id", documentId);
    };

    const { data: doc } = await admin.from("documents").select("storage_path,file_name,mime").eq("id", documentId).maybeSingle();
    if (!doc) {
      await finish({ status: "failed", error: "missing_document", attempts: MAX_OCR_ATTEMPTS });
      return "failed";
    }
    const { data: blob, error: dlErr } = await admin.storage.from("evidence").download(doc.storage_path);
    if (dlErr || !blob) {
      await finish({ status: "failed", error: "download_failed" });
      return "failed";
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    if (doc.mime === "application/pdf" && (await extractPdfText(bytes, 200))) {
      await finish({ status: "skipped", error: null });
      return "skipped";
    }

    try {
      const r = await provider.read(bytes, doc.file_name, doc.mime);
      await finish({ status: "done", text: r.text, confidence: r.confidence, page_count: r.pageCount, engine: r.engine, error: null });
      return "done";
    } catch (e) {
      const err = e instanceof OcrError ? e : new OcrError("engine_error", true);
      await finish({ status: "failed", error: err.code, ...(err.retryable ? {} : { attempts: MAX_OCR_ATTEMPTS }) });
      return "failed";
    }
  } catch (e) {
    console.error("ocr run failed", documentId, e instanceof Error ? e.message : "unknown");
    return "failed";
  }
}

/** Schedules one OCR read per document, e.g. `queueOcr(ids, (t) => after(t))` after an upload. */
export function queueOcr(documentIds: string[], schedule: (task: () => Promise<void>) => void): void {
  for (const id of documentIds) schedule(() => runOcr(id).then(() => undefined));
}

/**
 * Cron: retries `pending`/`failed` documents with attempts left, and reads documents that have never been read
 * (uploaded before OCR existed), oldest first, up to OCR_SWEEP_BATCH per run. `caseId` limits it to one case.
 */
export async function sweepOcr(scope: { caseId?: string } = {}): Promise<{ processed: number }> {
  if (!(await ocrActive())) return { processed: 0 };
  const admin = createAdminClient();

  let retry = admin
    .from("document_texts")
    .select("document_id, documents!inner(case_id)")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_OCR_ATTEMPTS)
    .order("updated_at", { ascending: true })
    .limit(OCR_SWEEP_BATCH);
  if (scope.caseId) retry = retry.eq("documents.case_id", scope.caseId);
  const { data: retries } = await retry;

  let unread = admin
    .from("documents")
    .select("id, document_texts!left(document_id)")
    .is("document_texts", null)
    .order("created_at", { ascending: true })
    .limit(OCR_SWEEP_BATCH);
  if (scope.caseId) unread = unread.eq("case_id", scope.caseId);
  const { data: fresh } = await unread;

  const ids = [...(retries ?? []).map((r) => r.document_id as string), ...(fresh ?? []).map((d) => d.id as string)].slice(0, OCR_SWEEP_BATCH);
  for (const id of ids) await runOcr(id);
  return { processed: ids.length };
}

/** "Read text again": gives the document fresh attempts. The caller schedules runOcr. */
export async function rereadOcr(documentId: string): Promise<void> {
  await createAdminClient()
    .from("document_texts")
    .update({ status: "pending", attempts: 0, error: null, claimed_at: null })
    .eq("document_id", documentId);
}

/** An officer or admin presses "Read text again": fresh attempts, audited, and the read is scheduled. */
export async function rereadDocumentTextAs(
  actor: StaffUser,
  documentId: string,
  schedule: (task: () => Promise<void>) => void,
): Promise<void> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();
  await rereadOcr(documentId);
  await logAudit({ actorId: actor.id, channel: "web", action: "ocr_reread", entity: "documents", entityId: documentId });
  schedule(() => runOcr(documentId).then(() => undefined));
}
