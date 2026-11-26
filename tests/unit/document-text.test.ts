import { describe, it, expect } from "vitest";
import { extractPdfText } from "@/lib/ai/document-text";
import { makeTextPdf } from "../helpers/pdf";

describe("extractPdfText", () => {
  it("reads the text layer of a PDF", async () => {
    const text = await extractPdfText(makeTextPdf(["Official receipt", "Received KES 50,000 from client"]));
    expect(text).toContain("Official receipt");
    expect(text).toContain("KES 50,000");
  });

  it("caps the length", async () => {
    const text = await extractPdfText(makeTextPdf(["A".repeat(200)]), 50);
    expect(text!.length).toBeLessThanOrEqual(50);
  });

  it("returns null for non-PDF bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(await extractPdfText(png)).toBeNull();
  });
});
