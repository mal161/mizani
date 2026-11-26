import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { redact } from "./redact";
import { extractPdfText } from "./document-text";
import { activeProvider, caseParties, recordAi, addCounts, type AiRunStatus } from "./triage";

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

/**
 * Summarises the whole case file for an officer: complaint, timeline (incl. internal notes) and the text
 * of PDF evidence, all redacted. Scanned images are not read (no OCR); the summary input says so.
 */
export async function summarizeCaseAs(actor: StaffUser, caseId: string): Promise<{ status: AiRunStatus }> {
  const provider = await activeProvider();
  if (!provider) return { status: "disabled" };
  const admin = createAdminClient();
  const { parties, summary, description } = await caseParties(caseId);

  const [{ data: events }, { data: docs }] = await Promise.all([
    admin.from("case_events").select("type,created_at,body").eq("case_id", caseId).order("created_at"),
    admin.from("documents").select("file_name,mime,storage_path,visibility").eq("case_id", caseId).order("created_at"),
  ]);
  const lines = (events ?? [])
    .filter((e) => !["sms_failed", "routing_failed", "ai_failed"].includes(e.type))
    .map((e) => eventLine(e as { type: string; created_at: string; body: Record<string, unknown> }));

  for (const d of docs ?? []) {
    if (d.mime !== "application/pdf") {
      lines.push(`Document ${d.file_name}: scanned image, not read by AI.`);
      continue;
    }
    const { data: blob } = await admin.storage.from("evidence").download(d.storage_path);
    const text = blob ? await extractPdfText(new Uint8Array(await blob.arrayBuffer()), PER_DOC_CHARS) : null;
    lines.push(text ? `Document ${d.file_name} (text):\n${text}` : `Document ${d.file_name}: no readable text (scanned).`);
  }

  const complaint = redact(`${summary}\n\n${description}`, parties);
  const timeline = redact(lines.join("\n"), parties);
  const result = await provider.summarizeCase({ complaint: complaint.text, timeline: timeline.text });
  return { status: await recordAi(caseId, "case_summary", provider, result, addCounts(complaint.counts, timeline.counts), actor) };
}
