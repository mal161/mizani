import { PDFDocument } from "pdf-lib";
import { Writer } from "@/lib/pdf/writer";

export interface NoticeData {
  caseNumber: string;
  advocateName: string;
  admissionNo: string;
  firm?: string | null;
  complainantName: string;
  summary: string;
  description: string;
  servedOn: string;
  responseDue: string;
  activationCode: string;
  portalUrl: string;
  office: string;
}

/**
 * Formal notice to the advocate (A4 PDF, English with a Kiswahili summary). Contains the allegations and the
 * complainant's name, never the complainant's contact details. The activation code exists only in this file.
 */
export async function buildNoticeLetter(d: NoticeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Notice of complaint ${d.caseNumber}`);
  doc.setAuthor("Advocates Complaints Commission");
  const w = await Writer.create(doc);

  w.text("ADVOCATES COMPLAINTS COMMISSION", { size: 13, bold: true, gap: 2 });
  w.text(`${d.office} Office`, { gap: 14 });
  w.text(`NOTICE OF COMPLAINT - Case ${d.caseNumber}`, { size: 12, bold: true, gap: 10 });
  w.text(`To: ${d.advocateName}, Advocate (Admission No. ${d.admissionNo})${d.firm ? `, ${d.firm}` : ""}`);
  w.text(`Date of service: ${d.servedOn}`, { gap: 12 });
  w.text(
    `A complaint has been made against you to the Advocates Complaints Commission by ${d.complainantName}. ` +
      "The Commission invites your written response to the allegations below.",
    { gap: 10 },
  );
  w.text("Summary of the complaint", { bold: true, gap: 2 });
  w.text(d.summary, { gap: 8 });
  w.text("Allegations as made by the complainant", { bold: true, gap: 2 });
  w.text(d.description, { gap: 12 });
  w.text("Your response", { bold: true, gap: 2 });
  w.text(
    `Please respond in writing by ${d.responseDue}. You may attach supporting documents. ` +
      "Respond online on Mizani, the Commission's case system:",
    { gap: 2 },
  );
  w.text(`1. Go to ${d.portalUrl}`, { gap: 2 });
  w.text(`2. Enter your admission number (${d.admissionNo}) and this activation code: ${d.activationCode}`, { bold: true, gap: 2 });
  w.text("3. Enter your mobile number and the SMS code you receive. You can then read the complaint and respond.", { gap: 4 });
  w.text("The activation code is valid for 30 days and can be used once. Keep it confidential.", { gap: 12 });
  w.text("Ilani kwa Kiswahili", { bold: true, gap: 2 });
  w.text(
    `Lalamiko limewasilishwa dhidi yako kwa Tume ya Malalamiko dhidi ya Mawakili (kesi ${d.caseNumber}). ` +
      `Tafadhali jibu kwa maandishi kabla ya ${d.responseDue} kupitia Mizani: ${d.portalUrl} - ` +
      `tumia nambari yako ya usajili ${d.admissionNo} na nambari ya uanzishaji ${d.activationCode}.`,
    { gap: 14 },
  );
  w.text("Advocates Complaints Commission", { bold: true });
  return doc.save();
}
