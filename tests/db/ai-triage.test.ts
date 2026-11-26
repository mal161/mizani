import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { fileComplaint } from "@/lib/cases/file-complaint";
import { afterFiling } from "@/lib/cases/after-filing";
import { latestAi } from "@/lib/ai/triage";
import { getAiProvider, resetAiProviderForTests } from "@/lib/ai";
import type { FakeAiProvider } from "@/lib/ai/fake";
import { adminClient, signInAs } from "../helpers/db";

let complainantId: string;
let advocate: { id: string; full_name: string };
const fake = () => getAiProvider() as FakeAiProvider;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  process.env.AI_PROVIDER = "fake";
  resetAiProviderForTests();
  ({ userId: complainantId } = await signInAs("complainant", "+254700001801"));
  await adminClient().from("profiles").update({ full_name: "Zawadi Mutheu" }).eq("id", complainantId);
  const { data } = await adminClient().from("advocates").select("id,full_name").limit(1).single();
  advocate = data!;
});
beforeEach(() => {
  fake().calls.length = 0;
});
afterAll(async () => {
  await adminClient().from("settings").update({ value: true }).eq("key", "ai_enabled");
});

async function file(description: string) {
  const r = await fileComplaint(
    {
      advocateId: advocate.id,
      advocateNameGiven: advocate.full_name,
      summary: "Advocate withheld my settlement money",
      description,
      language: "en",
      consentDataProcessing: true,
    },
    [],
    { complainantId, filedBy: complainantId, channel: "online", locale: "en" },
  );
  await afterFiling(r.caseId);
  return r;
}

describe("triage on filing", () => {
  it("stores a suggestion from redacted text only, and audits without content", async () => {
    const r = await file(
      `I am Zawadi Mutheu, ID number 23456789, phone 0700 001 801, email zawadi.m@example.com. ` +
        `${advocate.full_name} received KES 300,000 for me and has not paid.`,
    );
    const row = await latestAi(r.caseId, "triage");
    expect(row?.status).toBe("ok");
    expect(row?.output).toMatchObject({ category: expect.any(String), priority: "high" });

    const sent = (fake().calls.at(-1)!.input as { text: string }).text;
    for (const secret of ["Zawadi", "Mutheu", "23456789", "0700 001 801", "zawadi.m@example.com", advocate.full_name]) {
      expect(sent).not.toContain(secret);
    }
    for (const tag of ["[COMPLAINANT]", "[ID_NUMBER]", "[PHONE]", "[EMAIL]", "[ADVOCATE]"]) expect(sent).toContain(tag);
    expect(sent).toContain("KES 300,000");

    const { data: audit } = await adminClient()
      .from("audit_log")
      .select("details")
      .eq("entity_id", r.caseId)
      .eq("action", "ai_triage")
      .single();
    expect(audit!.details).toMatchObject({ provider: "fake", ok: true, redactions: { phone: 1, email: 1, national_id: 1 } });
    expect(JSON.stringify(audit!.details)).not.toContain("withheld");
  });

  it("never changes the case's own category or priority", async () => {
    const r = await file("The advocate withheld funds owed to me for six months and stopped answering.");
    const { data } = await adminClient().from("cases").select("category,priority").eq("id", r.caseId).single();
    expect(data).toEqual({ category: null, priority: "normal" });
  });

  it("does nothing when AI is switched off, and filing still succeeds", async () => {
    await adminClient().from("settings").update({ value: false }).eq("key", "ai_enabled");
    try {
      const r = await file("The advocate never filed my case although I paid the full fee in advance.");
      expect(r.caseNumber).toMatch(/^ACC\//);
      expect(await latestAi(r.caseId, "triage")).toBeNull();
      expect(fake().calls).toHaveLength(0);
    } finally {
      await adminClient().from("settings").update({ value: true }).eq("key", "ai_enabled");
    }
  });

  it("records 'unavailable' when the provider refuses, and filing still succeeds", async () => {
    fake().failNext("refused");
    const r = await file("The advocate threatened me when I asked about the status of my land matter.");
    expect((await latestAi(r.caseId, "triage"))?.status).toBe("unavailable");
  });

  it("treats a category outside the configured list as unavailable", async () => {
    fake().categoryNext("made_up_category");
    const r = await file("The advocate charged me twice for the same conveyancing work last year.");
    const row = await latestAi(r.caseId, "triage");
    expect(row?.status).toBe("unavailable");
    expect(row?.output).toBeNull();
  });
});
