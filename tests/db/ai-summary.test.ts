import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { summarizeCaseAs } from "@/lib/ai/summarize";
import { latestAi } from "@/lib/ai/triage";
import { addNoteAs } from "@/lib/cases/actions";
import { fileComplaint } from "@/lib/cases/file-complaint";
import { getAiProvider, resetAiProviderForTests } from "@/lib/ai";
import type { FakeAiProvider } from "@/lib/ai/fake";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff } from "../helpers/db";
import { makeTextPdf } from "../helpers/pdf";

let officer: StaffUser;
let complainantId: string;
const fake = () => getAiProvider() as FakeAiProvider;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  process.env.AI_PROVIDER = "fake";
  resetAiProviderForTests();
  const s = await signInStaff("staff", `summary-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700002001"));
});
beforeEach(() => {
  fake().calls.length = 0;
});
afterAll(async () => {
  await adminClient().from("settings").update({ value: true }).eq("key", "ai_enabled");
});

async function caseWithEvidence() {
  const pdf = makeTextPdf(["Receipt for deposit", "Paid KES 75,000 to the firm"]);
  const r = await fileComplaint(
    {
      advocateNameGiven: "Summary Test Advocate",
      summary: "Advocate took a deposit and did nothing",
      description: "I paid a deposit for a land search and the advocate has done nothing since March.",
      language: "en",
      consentDataProcessing: true,
    },
    [new File([pdf], "receipt.pdf", { type: "application/pdf" })],
    { complainantId, filedBy: complainantId, channel: "online", locale: "en" },
  );
  return r.caseId;
}

describe("summarizeCaseAs", () => {
  it("sends redacted complaint, timeline and PDF text; stores and audits with the officer", async () => {
    const caseId = await caseWithEvidence();
    await addNoteAs(officer, caseId, "Complainant called from 0711 222 333 asking for an update.");
    expect((await summarizeCaseAs(officer, caseId)).status).toBe("ok");

    const input = fake().calls.at(-1)!.input as { complaint: string; timeline: string };
    expect(input.timeline).toContain("[PHONE]");
    expect(input.timeline).not.toContain("0711 222 333");
    expect(input.timeline).toContain("Paid KES 75,000");
    expect(input.complaint).toContain("[ADVOCATE]");

    expect((await latestAi(caseId, "case_summary"))?.status).toBe("ok");
    const { data } = await adminClient()
      .from("audit_log")
      .select("actor_id")
      .eq("entity_id", caseId)
      .eq("action", "ai_summary");
    expect(data!.map((r) => r.actor_id)).toContain(officer.id);
  });

  it("returns disabled when AI is switched off", async () => {
    const caseId = await caseWithEvidence();
    await adminClient().from("settings").update({ value: false }).eq("key", "ai_enabled");
    try {
      expect((await summarizeCaseAs(officer, caseId)).status).toBe("disabled");
      expect(fake().calls.filter((c) => c.kind === "summary")).toHaveLength(0);
    } finally {
      await adminClient().from("settings").update({ value: true }).eq("key", "ai_enabled");
    }
  });
});
