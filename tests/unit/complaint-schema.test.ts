import { describe, it, expect } from "vitest";
import { complaintSchema, validateEvidence, MAX_FILE_BYTES } from "@/lib/cases/schema";
import { smsText } from "@/lib/cases/messages";

const valid = {
  advocateNameGiven: "Amani Achieng",
  summary: "Advocate withheld my settlement money",
  description: "I was paid a settlement in March but the advocate has refused to release it to me.",
  language: "en",
  consentDataProcessing: true,
};

describe("complaintSchema", () => {
  it("accepts a valid complaint", () => {
    expect(complaintSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["short summary", { summary: "too short" }],
    ["short description", { description: "not enough detail" }],
    ["missing consent", { consentDataProcessing: false }],
    ["bad language", { language: "fr" }],
    ["one-letter advocate", { advocateNameGiven: "A" }],
    ["non-uuid advocate id", { advocateId: "123" }],
  ])("rejects %s", (_n, patch) => {
    expect(complaintSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateEvidence", () => {
  it("accepts pdf/jpeg/png up to 10 MB", () => {
    expect(validateEvidence([file("a.pdf", "application/pdf", 1000), file("b.png", "image/png", MAX_FILE_BYTES)])).toBeNull();
  });
  it("rejects a file over 10 MB", () => {
    expect(validateEvidence([file("big.pdf", "application/pdf", MAX_FILE_BYTES + 1)])).toBe("file_too_large");
  });
  it("rejects an .exe", () => {
    expect(validateEvidence([file("x.exe", "application/x-msdownload", 10)])).toBe("file_type");
  });
  it("rejects more than 5 files", () => {
    expect(validateEvidence(Array.from({ length: 6 }, (_, i) => file(`${i}.pdf`, "application/pdf", 10)))).toBe("too_many_files");
  });
  it("ignores empty file inputs", () => {
    expect(validateEvidence([file("", "application/octet-stream", 0)])).toBeNull();
  });
});

describe("smsText", () => {
  it("fits one SMS and contains case number and PIN in both languages", () => {
    for (const l of ["en", "sw"] as const) {
      const msg = smsText.filed(l, "ACC/2026/000123", "048213");
      expect(msg.length).toBeLessThanOrEqual(160);
      expect(msg).toContain("ACC/2026/000123");
      expect(msg).toContain("048213");
    }
  });
});
