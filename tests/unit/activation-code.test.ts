import { describe, it, expect } from "vitest";
import { generateActivationCode, normaliseActivationCode } from "@/lib/advocates/activation-code";

describe("activation codes", () => {
  it("are 8 characters from an unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) expect(generateActivationCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("are not trivially repeated", () => {
    expect(new Set(Array.from({ length: 200 }, generateActivationCode)).size).toBe(200);
  });

  it("normalise what people type", () => {
    expect(normaliseActivationCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normaliseActivationCode("AbCd 2345")).toBe("ABCD2345");
  });
});
