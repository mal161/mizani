import { PDFDocument } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { Writer } from "@/lib/pdf/writer";
import { OUTCOME_LABELS, type Outcome } from "./outcomes";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/** The Commission's decision as a letter to both parties (English, with a Kiswahili summary). */
export async function buildDecisionLetter(decisionId: string): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data: d, error } = await admin
    .from("decisions")
    .select("outcome,reasons,orders,amount_kes,panel,decided_at,superseded_by,cases(case_number,complainant:profiles!cases_complainant_id_fkey(full_name),advocates(full_name,admission_no),advocate_name_given)")
    .eq("id", decisionId)
    .single();
  if (error) throw new Error(`load decision: ${error.message}`);
  const c = d.cases as unknown as {
    case_number: string;
    complainant: { full_name: string | null } | null;
    advocates: { full_name: string; admission_no: string } | null;
    advocate_name_given: string;
  };
  const { data: panel } = await admin.from("profiles").select("id,full_name").in("id", d.panel as string[]);
  const outcome = d.outcome as Outcome;

  const doc = await PDFDocument.create();
  doc.setTitle(`Decision ${c.case_number}`);
  doc.setAuthor("Advocates Complaints Commission");
  const w = await Writer.create(doc);
  w.text("ADVOCATES COMPLAINTS COMMISSION", { size: 13, bold: true, gap: 10 });
  w.text(`DECISION - Case ${c.case_number}${d.superseded_by ? " (SUPERSEDED)" : ""}`, { size: 12, bold: true, gap: 8 });
  w.text(`Complainant: ${c.complainant?.full_name ?? "-"}`, { gap: 2 });
  w.text(`Advocate: ${c.advocates ? `${c.advocates.full_name}, ${c.advocates.admission_no}` : c.advocate_name_given}`, { gap: 2 });
  w.text(`Date of decision: ${day(d.decided_at)}`, { gap: 2 });
  w.text(`Panel: ${(panel ?? []).map((p) => p.full_name ?? "Commissioner").join(", ")}`, { gap: 12 });
  w.text(`Outcome: ${OUTCOME_LABELS.en[outcome]}`, { bold: true, gap: 4 });
  if (d.amount_kes) w.text(`Amount: ${kes(Number(d.amount_kes))}`, { bold: true, gap: 8 });
  w.text("Reasons", { bold: true, gap: 2 });
  w.text(d.reasons, { gap: 10 });
  if (d.orders) {
    w.text("Orders", { bold: true, gap: 2 });
    w.text(d.orders, { gap: 10 });
  }
  w.text("Uamuzi kwa Kiswahili", { bold: true, gap: 2 });
  w.text(
    `Tume ya Malalamiko dhidi ya Mawakili imetoa uamuzi katika kesi ${c.case_number}: ${OUTCOME_LABELS.sw[outcome]}` +
      `${d.amount_kes ? ` (${kes(Number(d.amount_kes))})` : ""}. Sababu kamili zimeandikwa hapo juu kwa Kiingereza.`,
    { gap: 14 },
  );
  w.text("Advocates Complaints Commission", { bold: true });
  return doc.save();
}
