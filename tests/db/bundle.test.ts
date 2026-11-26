import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCaseBundle } from "@/lib/commission/bundle";
import { uploadEvidence } from "@/lib/cases/evidence";
import { addNoteAs } from "@/lib/cases/actions";
import { extractPdfText } from "@/lib/ai/document-text";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";
import { makeTextPdf } from "../helpers/pdf";

const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

let officer: StaffUser;
let complainantId: string;

beforeAll(async () => {
  const s = await signInStaff("staff", `bundle-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700002901"));
});

describe("buildCaseBundle", () => {
  it("includes the file, the history and each exhibit; skips unreadable files with a placeholder; never AI output", async () => {
    const c = await makeCase(complainantId, { summary: "Bundle test complaint", description: "The advocate withheld KES 120,000 from the sale of land." });
    await uploadEvidence(
      c.id,
      [
        new File([makeTextPdf(["EXHIBIT-PDF-INNER-TEXT", "Receipt for KES 120,000"])], "receipt.pdf", { type: "application/pdf" }),
        new File([PNG_1X1], "photo.png", { type: "image/png" }),
        new File([new TextEncoder().encode("%PDF-1.4 this is not really a pdf")], "broken.pdf", { type: "application/pdf" }),
      ],
      complainantId,
    );
    await addNoteAs(officer, c.id, "Internal note: called the advocate twice.");
    const admin = adminClient();
    const { data: p } = await admin.auth.admin.createUser({ email: `bundle-adv-${Date.now()}@test.mizani.local`, email_confirm: true });
    await admin.from("profiles").insert({ id: p.user!.id, role: "advocate", full_name: "Bundle Advocate" });
    await admin.from("advocate_responses").insert({ case_id: c.id, advocate_profile_id: p.user!.id, text: "ADVOCATE-RESPONSE-TEXT denying the claim.", late: true });
    await admin.from("ai_outputs").insert({ case_id: c.id, kind: "case_summary", provider: "fake", model: "fake-1", status: "ok", output: { summary_en: "AI-SUMMARY-MUST-NOT-APPEAR" } });

    const pdf = await buildCaseBundle(c.id);
    const text = (await extractPdfText(pdf, 500_000))!;
    for (const s of [c.case_number, "Confidential", "Internal note: called the advocate twice.", "ADVOCATE-RESPONSE-TEXT", "Exhibit 1", "Exhibit 2", "Exhibit 3", "EXHIBIT-PDF-INNER-TEXT", "could not be included"]) {
      expect(text).toContain(s);
    }
    expect(text).not.toContain("AI-SUMMARY-MUST-NOT-APPEAR");

    // Front matter + 3 separators + 1 page from the PDF exhibit + 1 image page; the broken file adds no pages.
    const doc = await PDFDocument.load(pdf);
    const front = await PDFDocument.load(await buildCaseBundle(c.id, { frontMatterOnly: true }));
    expect(doc.getPageCount()).toBe(front.getPageCount() + 3 + 1 + 1);
  });
});
