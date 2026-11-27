import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { redact } from "./redact";
import { extractPdfText } from "./document-text";
import { OCR_RELIABLE_CONFIDENCE, type OcrTextRow } from "@/lib/ocr/text";
import { activeProvider, caseParties, recordAi, addCounts, type AiRunStatus } from "./triage";
import { aiRateLimited } from "./limits";

const PER_DOC_CHARS = 4000;
const TEXT_EVENTS = new Set(["note", "info_requested", "info_provided", "stage_changed"]);

function eventLine(e: { type: string; created_at: string; body: Record<string, unknown> }): string {
  const date = e.created_at.slice(0, 10);
  const b = e.body ?? {};
  const text =
    e.type === "stage_changed"
      ? `${b.from} -> ${b.to}${b.reason ? ` (reason: ${b.reason})` : ""}`
      : TEXT_EVENTS.has(e.type)
        ? String(b.text ?? b.message ?? "")
        : "";
  return `${date} ${e.type}${text ? `: ${text}` : ""}`;
}

/** A scanned document's line in the summary input: its OCR text only when reliable. */
function scanLine(fileName: string, ocr: OcrTextRow | null): string {
  if (ocr?.status === "done" && ocr.text?.trim()) {
    const confidence = Math.round(Number(ocr.confidence ?? 0));
    if (confidence >= OCR_RELIABLE_CONFIDENCE) {
      return `Document ${fileName} (text read by OCR, confidence ${confidence}%):\n${ocr.text.slice(0, PER_DOC_CHARS)}`;
    }
    return `Document ${fileName}: scanned, but the text could not be read reliably.`;
  }
  if (ocr?.status === "done") return `Document ${fileName}: scanned, no text found.`;
  return `Document ${fileName}: scanned, text not read yet.`;
}

/**
 * Summarises the whole case file for an officer: complaint, timeline (incl. internal notes) and the text
 * of evidence, all redacted. Scans use their OCR text only when its confidence is at least
 * OCR_RELIABLE_CONFIDENCE (garbled text could hide names from redaction); otherwise the input says so.
 */
export async function summarizeCaseAs(actor: StaffUser, caseId: string): Promise<{ status: AiRunStatus }> {
  const provider = await activeProvider();
  if (!provider) return { status: "disabled" };
  const admin = createAdminClient();
  if (await aiRateLimited(caseId, "case_summary")) return { status: "rate_limited" };
  const { parties, known, summary, description } = await caseParties(caseId);

  const [{ data: events }, { data: docs }] = await Promise.all([
    admin.from("case_events").select("type,created_at,body").eq("case_id", caseId).order("created_at"),
    admin
      .from("documents")
      .select("file_name,mime,storage_path,visibility,document_texts(status,text,confidence)")
      .eq("case_id", caseId)
      .order("created_at"),
  ]);
  const lines = (events ?? [])
    .filter((e) => !["sms_failed", "routing_failed", "ai_failed"].includes(e.type))
    .map((e) => eventLine(e as { type: string; created_at: string; body: Record<string, unknown> }));

  for (const d of docs ?? []) {
    if (d.mime === "application/pdf") {
      const { data: blob } = await admin.storage.from("evidence").download(d.storage_path);
      const text = blob ? await extractPdfText(new Uint8Array(await blob.arrayBuffer()), PER_DOC_CHARS) : null;
      if (text) {
        lines.push(`Document ${d.file_name} (text):\n${text}`);
        continue;
      }
    }
    lines.push(scanLine(d.file_name, d.document_texts as unknown as OcrTextRow | null));
  }

  const complaint = redact(`${summary}\n\n${description}`, parties, known);
  const timeline = redact(lines.join("\n"), parties, known);
  const result = await provider.summarizeCase({ complaint: complaint.text, timeline: timeline.text });
  return { status: await recordAi(caseId, "case_summary", provider, result, addCounts(complaint.counts, timeline.counts), actor) };
}
