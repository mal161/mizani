import { describe, it, expect } from "vitest";
import { generatePin, hashPin, verifyPin } from "@/lib/pin";

describe("status PIN", () => {
  it("is always 6 digits", () => {
    for (let i = 0; i < 1000; i++) expect(generatePin()).toMatch(/^\d{6}$/);
  });

  it("is not trivially repeated", () => {
    const pins = new Set(Array.from({ length: 200 }, generatePin));
    expect(pins.size).toBeGreaterThan(190);
  });

  it("verifies the right PIN and rejects a wrong one", async () => {
    const hash = await hashPin("012345");
    expect(hash).not.toContain("012345");
    expect(await verifyPin("012345", hash)).toBe(true);
    expect(await verifyPin("012346", hash)).toBe(false);
  });
});
