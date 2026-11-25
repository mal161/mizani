import { describe, it, expect } from "vitest";
import { STAGES, isStage } from "@/lib/cases/stages";
import { caseSlug, caseNumberFromSlug, parseCaseNumberInput } from "@/lib/cases/case-number";

describe("stages", () => {
  it("are in lifecycle order", () => {
    expect(STAGES).toEqual([
      "received",
      "screening",
      "advocate_notified",
      "investigation",
      "conciliation",
      "hearing",
      "decision",
      "closed",
    ]);
  });
  it("isStage guards unknown values", () => {
    expect(isStage("hearing")).toBe(true);
    expect(isStage("archived")).toBe(false);
  });
});

describe("case number URL slugs", () => {
  it("round-trips", () => {
    expect(caseSlug("ACC/2026/000123")).toBe("ACC-2026-000123");
    expect(caseNumberFromSlug("ACC-2026-000123")).toBe("ACC/2026/000123");
  });
  it("rejects malformed slugs", () => {
    expect(caseNumberFromSlug("ACC-26-1")).toBeNull();
    expect(caseNumberFromSlug("../etc")).toBeNull();
  });
});

describe("parseCaseNumberInput (status check / USSD)", () => {
  it.each([
    ["ACC/2026/000123", "ACC/2026/000123"],
    ["acc/2026/000123", "ACC/2026/000123"],
    ["ACC-2026-000123", "ACC/2026/000123"],
    ["2026000123", "ACC/2026/000123"],
    [" 2026/000123 ", "ACC/2026/000123"],
  ])("%s -> %s", (input, expected) => {
    expect(parseCaseNumberInput(input)).toBe(expected);
  });
  it.each(["", "123", "ACC/2026/12", "20260001234"])("rejects %s", (input) => {
    expect(parseCaseNumberInput(input)).toBeNull();
  });
});
