import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

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

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

/** Standard PDF fonts only cover Latin-1: normalise quotes/dashes and drop anything else. */
function pdfSafe(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

class Writer {
  private page: PDFPage;
  private y: number;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  text(raw: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.font;
    const width = A4[0] - 2 * MARGIN;
    for (const para of pdfSafe(raw).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
        else {
          this.line(line, font, size);
          // A single word wider than the page is split hard.
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > width) {
            let cut = rest.length;
            while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
            this.line(rest.slice(0, cut), font, size);
            rest = rest.slice(cut);
          }
          line = rest;
        }
      }
      this.line(line, font, size);
    }
    this.y -= opts.gap ?? 6;
  }

  private line(s: string, font: PDFFont, size: number) {
    this.ensure(size + 4);
    this.page.drawText(s, { x: MARGIN, y: this.y - size, size, font, color: rgb(0.1, 0.1, 0.12) });
    this.y -= size + 4;
  }
}

/**
 * Formal notice to the advocate (A4 PDF, English with a Kiswahili summary). Contains the allegations and the
 * complainant's name, never the complainant's contact details. The activation code exists only in this file.
 */
export async function buildNoticeLetter(d: NoticeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Notice of complaint ${d.caseNumber}`);
  doc.setAuthor("Advocates Complaints Commission");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

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
