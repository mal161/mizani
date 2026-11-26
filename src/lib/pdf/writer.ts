import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const A4: [number, number] = [595.28, 841.89];
export const MARGIN = 56;

/** Standard PDF fonts only cover Latin-1: normalise line breaks, quotes and dashes, and drop anything else. */
export function pdfSafe(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

/** Flowing A4 text with word wrap and automatic page breaks. */
export class Writer {
  private page: PDFPage;
  private y: number;

  private constructor(
    readonly doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  static async create(doc: PDFDocument): Promise<Writer> {
    return new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  }

  /** Starts a fresh page for following text. */
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
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
