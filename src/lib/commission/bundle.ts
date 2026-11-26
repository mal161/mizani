import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { A4, MARGIN, Writer } from "@/lib/pdf/writer";

const day = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10) : "-");
const stamp = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

function describeEvent(type: string, body: Record<string, unknown>): string {
  switch (type) {
    case "stage_changed":
      return `Stage ${body.from} -> ${body.to}${body.reason ? ` (reason: ${body.reason})` : ""}`;
    case "note":
      return `Internal note: ${body.text}`;
    case "info_requested":
      return `Information requested from complainant: ${body.message}`;
    case "info_provided":
      return `Complainant provided information: ${body.text ?? ""}`;
    case "advocate_notified":
      return `Advocate served on ${body.served_on} by ${body.method}; response due ${body.response_due}`;
    case "advocate_responded":
      return `Advocate responded${body.late ? " (late)" : ""}`;
    case "hearing_scheduled":
      return `Hearing scheduled for ${body.starts_at ? stamp(String(body.starts_at)) : "-"} (${body.mode}${body.venue ? `, ${body.venue}` : ""})`;
    case "hearing_changed":
      return `Hearing ${body.change}${body.reason ? `: ${body.reason}` : ""}`;
    case "decision_issued":
      return `Decision issued: ${body.outcome}`;
    default:
      return type.replace(/_/g, " ");
  }
}

/**
 * The full case file as one PDF for the Commission: cover, complaint, advocate responses, the complete history
 * (including internal notes), hearing minutes, then every document as a numbered exhibit — PDFs merged page by
 * page, images on their own page, unreadable files replaced by a note. AI output is never included.
 */
export async function buildCaseBundle(caseId: string, opts: { frontMatterOnly?: boolean } = {}): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data: c, error } = await admin
    .from("cases")
    .select(
      "case_number,summary,description,stage,category,priority,channel,office,created_at,advocate_name_given,advocate_served_on,complainant:profiles!cases_complainant_id_fkey(full_name),advocates(full_name,admission_no,firm)",
    )
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case: ${error.message}`);
  const [{ data: events }, { data: responses }, { data: hearings }, { data: docs }] = await Promise.all([
    admin.from("case_events").select("type,created_at,body,actor_id,visibility").eq("case_id", caseId).order("created_at"),
    admin.from("advocate_responses").select("text,late,created_at").eq("case_id", caseId).order("created_at"),
    admin.from("hearings").select("starts_at,mode,venue,status,minutes,panel").eq("case_id", caseId).order("starts_at"),
    admin.from("documents").select("id,file_name,mime,storage_path,uploaded_by,created_at,visibility").eq("case_id", caseId).order("created_at"),
  ]);
  const people = new Set<string>();
  for (const e of events ?? []) if (e.actor_id) people.add(e.actor_id);
  for (const d of docs ?? []) if (d.uploaded_by) people.add(d.uploaded_by);
  for (const h of hearings ?? []) for (const p of h.panel as string[]) people.add(p);
  const { data: profiles } = people.size ? await admin.from("profiles").select("id,full_name,role").in("id", [...people]) : { data: [] };
  const who = (id: string | null) => {
    const p = (profiles ?? []).find((x) => x.id === id);
    return p ? `${p.full_name ?? "Unnamed"} (${p.role})` : "system";
  };

  const complainant = (c.complainant as unknown as { full_name: string | null } | null)?.full_name ?? "-";
  const adv = c.advocates as unknown as { full_name: string; admission_no: string; firm: string | null } | null;

  const doc = await PDFDocument.create();
  doc.setTitle(`Case bundle ${c.case_number}`);
  doc.setAuthor("Advocates Complaints Commission");
  const w = await Writer.create(doc);

  w.text("ADVOCATES COMPLAINTS COMMISSION", { size: 13, bold: true, gap: 2 });
  w.text("CASE BUNDLE - Confidential - for the Commission", { size: 12, bold: true, gap: 12 });
  w.text(`Case: ${c.case_number}`, { bold: true, gap: 2 });
  w.text(`Complainant: ${complainant}`, { gap: 2 });
  w.text(`Advocate: ${adv ? `${adv.full_name}, ${adv.admission_no}${adv.firm ? `, ${adv.firm}` : ""}` : `${c.advocate_name_given} (not matched to the roll)`}`, { gap: 2 });
  w.text(`Filed: ${day(c.created_at)} (${c.channel}${c.office ? `, ${c.office}` : ""}) - Stage: ${c.stage} - Category: ${c.category ?? "-"} - Priority: ${c.priority}`, { gap: 2 });
  w.text(`Advocate served: ${day(c.advocate_served_on)}`, { gap: 2 });
  w.text(`Bundle prepared: ${stamp(new Date().toISOString())} (Nairobi)`, { gap: 12 });

  w.text("Contents", { bold: true, gap: 2 });
  w.text("1. The complaint  2. Advocate's responses  3. Case history  4. Hearings  5. Exhibits", { gap: 2 });
  (docs ?? []).forEach((d, i) => w.text(`   Exhibit ${i + 1}: ${d.file_name}`, { gap: 0 }));
  w.text("", { gap: 8 });

  w.text("1. The complaint", { bold: true, size: 12, gap: 4 });
  w.text(c.summary, { bold: true, gap: 4 });
  w.text(c.description, { gap: 12 });

  w.text("2. Advocate's responses", { bold: true, size: 12, gap: 4 });
  if (!responses?.length) w.text("No response received.", { gap: 12 });
  for (const r of responses ?? []) {
    w.text(`${stamp(r.created_at)}${r.late ? " - received after the deadline" : ""}`, { bold: true, gap: 2 });
    w.text(r.text, { gap: 10 });
  }

  w.text("3. Case history", { bold: true, size: 12, gap: 4 });
  for (const e of events ?? []) {
    w.text(`${stamp(e.created_at)} - ${who(e.actor_id)}${e.visibility === "internal" ? " [internal]" : ""}`, { bold: true, gap: 0 });
    w.text(describeEvent(e.type, (e.body ?? {}) as Record<string, unknown>), { gap: 6 });
  }

  w.text("4. Hearings", { bold: true, size: 12, gap: 4 });
  if (!hearings?.length) w.text("No hearings.", { gap: 12 });
  for (const h of hearings ?? []) {
    w.text(`${stamp(h.starts_at)} - ${h.mode === "online" ? "online" : h.venue} - ${h.status}`, { bold: true, gap: 2 });
    w.text(`Panel: ${(h.panel as string[]).map(who).join(", ")}`, { gap: 2 });
    w.text(h.minutes ? `Minutes: ${h.minutes}` : "No minutes recorded.", { gap: 10 });
  }
  if (opts.frontMatterOnly) return doc.save();

  // 5. Exhibits
  for (const [i, d] of (docs ?? []).entries()) {
    w.newPage();
    w.text(`Exhibit ${i + 1}`, { bold: true, size: 14, gap: 6 });
    w.text(`${d.file_name} - uploaded by ${who(d.uploaded_by)} on ${stamp(d.created_at)}${d.visibility === "internal" ? " [internal]" : ""}`, { gap: 6 });
    const { data: blob } = await admin.storage.from("evidence").download(d.storage_path);
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    let included = false;
    try {
      if (bytes && d.mime === "application/pdf") {
        const src = await PDFDocument.load(bytes);
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
        included = true;
      } else if (bytes && (d.mime === "image/png" || d.mime === "image/jpeg")) {
        const img = d.mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage(A4);
        const maxW = A4[0] - 2 * MARGIN;
        const maxH = A4[1] - 2 * MARGIN;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const width = img.width * scale;
        const height = img.height * scale;
        page.drawImage(img, { x: (A4[0] - width) / 2, y: A4[1] - MARGIN - height, width, height });
        included = true;
      }
    } catch {
      included = false;
    }
    if (!included) w.text("This document could not be included (unreadable, encrypted or unsupported). See the original file in Mizani.", { bold: true });
  }
  return doc.save();
}
