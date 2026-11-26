import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { Writer } from "@/lib/pdf/writer";

describe("Writer", () => {
  it("wraps a very long unbroken word quickly (untrusted text up to 20,000 chars)", async () => {
    const doc = await PDFDocument.create();
    const w = await Writer.create(doc);
    const started = Date.now();
    w.text("x".repeat(20_000));
    w.text("W".repeat(5_000), { bold: true });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    await doc.save();
  }, 30_000);
});
