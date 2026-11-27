import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/ai/document-text";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { getOcrProvider, OcrError } from "./index";
import { logAudit } from "@/lib/audit";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";

/** Reads per document before it stays `failed` (the cron retries until then). */
export const MAX_OCR_ATTEMPTS = 3;
/** Documents read per cron run, one after another. */
export const OCR_SWEEP_BATCH = 5;
/** No new read starts after this much of a sweep (each read may take up to 120 s; the function limit is 300 s). */
export const OCR_SWEEP_BUDGET_MS = 150_000;
/** A claim older than this belongs to a read that died (the claim function uses the same 5 minutes). */
const STALE_CLAIM_MS = 5 * 60_000;

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
      let attempts: Record<string, number> = {};
      if (!err.retryable) attempts = { attempts: MAX_OCR_ATTEMPTS };
      else if (!err.consumesAttempt) {
        const { data } = await admin.from("document_texts").select("attempts").eq("document_id", documentId).single();
        attempts = { attempts: Math.max(0, Number(data?.attempts ?? 1) - 1) };
      }
      await finish({ status: "failed", error: err.code, ...attempts });
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
export async function sweepOcr(scope: { caseId?: string; budgetMs?: number } = {}): Promise<{ processed: number }> {
  if (!(await ocrActive())) return { processed: 0 };
  const started = Date.now();
  const budget = scope.budgetMs ?? OCR_SWEEP_BUDGET_MS;
  const admin = createAdminClient();

  // A read killed mid-way (e.g. the function hit its time limit) on its last attempt would stay "pending" for
  // ever: make it a failure, so staff see "Read text again".
  let dead = admin
    .from("document_texts")
    .update({ status: "failed", error: "interrupted", claimed_at: null })
    .eq("status", "pending")
    .gte("attempts", MAX_OCR_ATTEMPTS)
    .lt("claimed_at", new Date(started - STALE_CLAIM_MS).toISOString());
  if (scope.caseId) {
    const { data: docs } = await admin.from("documents").select("id").eq("case_id", scope.caseId);
    dead = dead.in("document_id", (docs ?? []).map((d) => d.id as string));
  }
  await dead;

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
  let processed = 0;
  for (const id of ids) {
    if (Date.now() - started >= budget) break;
    await runOcr(id);
    processed += 1;
  }
  return { processed };
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
