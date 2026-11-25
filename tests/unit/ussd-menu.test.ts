import { describe, it, expect, vi } from "vitest";
import { ussdResponse } from "@/lib/ussd/menu";
import type { checkStatus } from "@/lib/cases/status-check";

type Check = typeof checkStatus;

const ok: Check = vi.fn(async () => ({ ok: true as const, stage: "hearing" as const, updatedAt: "2026-11-20T10:00:00Z" }));
const invalid: Check = vi.fn(async () => ({ ok: false as const, reason: "invalid" as const }));
const locked: Check = vi.fn(async () => ({ ok: false as const, reason: "locked" as const }));

describe("USSD menu", () => {
  it("starts with a language choice", async () => {
    const r = await ussdResponse("", ok);
    expect(r).toMatch(/^CON /);
    expect(r).toContain("1. English");
    expect(r).toContain("2. Kiswahili");
  });

  it("asks for the case number in the chosen language", async () => {
    expect(await ussdResponse("1", ok)).toMatch(/^CON .*case number/i);
    expect(await ussdResponse("2", ok)).toMatch(/^CON .*nambari ya kesi/i);
  });

  it("rejects an invalid language choice", async () => {
    expect(await ussdResponse("9", ok)).toMatch(/^END /);
  });

  it("asks for the PIN after a well-formed case number", async () => {
    expect(await ussdResponse("1*2026000123", ok)).toMatch(/^CON .*PIN/);
  });

  it("ends on a malformed case number without calling check", async () => {
    const check = vi.fn(ok);
    expect(await ussdResponse("1*123", check)).toMatch(/^END /);
    expect(check).not.toHaveBeenCalled();
  });

  it("shows the stage in English and Swahili", async () => {
    const en = await ussdResponse("1*2026000123*123456", ok);
    expect(en).toMatch(/^END /);
    expect(en).toContain("ACC/2026/000123");
    expect(en).toContain("Hearing");
    expect(ok).toHaveBeenCalledWith("ACC/2026/000123", "123456", "ussd");
    expect(await ussdResponse("2*2026000123*123456", ok)).toContain("Usikilizaji");
  });

  it("gives the same message for unknown case and wrong PIN", async () => {
    expect(await ussdResponse("1*2026000123*000000", invalid)).toMatch(/^END .*not match/i);
  });

  it("tells a locked user to try later", async () => {
    expect(await ussdResponse("1*2026000123*000000", locked)).toMatch(/^END .*1 hour/i);
  });
});
