import { describe, it, expect } from "vitest";
import { buildNoticeLetter } from "@/lib/advocates/notice-letter";
import { extractPdfText } from "@/lib/ai/document-text";

describe("notice letter", () => {
  it("is a PDF with the case, deadline, activation code and how to respond, in both languages", async () => {
    const pdf = await buildNoticeLetter({
      caseNumber: "ACC/2026/000123",
      advocateName: "Amani Achieng",
      admissionNo: "P.105/1001/2006",
      firm: "Haki & Co. Advocates",
      complainantName: "Neema Wairimu",
      summary: "Advocate withheld settlement money",
      description: "The complainant alleges that KES 300,000 received in March was not paid over.",
      servedOn: "2026-11-28",
      responseDue: "2026-12-12",
      activationCode: "ABCD2345",
      portalUrl: "https://mizani.example/en/advocate/activate",
      office: "Nairobi",
    });
    const text = (await extractPdfText(pdf))!;
    for (const s of ["ACC/2026/000123", "ABCD2345", "2026-12-12", "P.105/1001/2006", "Amani Achieng", "Neema Wairimu", "/advocate/activate"]) {
      expect(text).toContain(s);
    }
    expect(text).toMatch(/Kiswahili|Ilani/);
  });

  it("wraps very long allegations onto further pages instead of cutting them off", async () => {
    const pdf = await buildNoticeLetter({
      caseNumber: "ACC/2026/000124",
      advocateName: "A",
      admissionNo: "P.1",
      complainantName: "B",
      summary: "S",
      description: "word ".repeat(3000) + "THE-END-MARKER",
      servedOn: "2026-11-28",
      responseDue: "2026-12-12",
      activationCode: "ABCD2345",
      portalUrl: "https://x/advocate/activate",
      office: "Mombasa",
    });
    expect(await extractPdfText(pdf, 100_000)).toContain("THE-END-MARKER");
  });
});
