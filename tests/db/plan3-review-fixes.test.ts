import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { afterFiling } from "@/lib/cases/after-filing";
import { triageCase, latestAi } from "@/lib/ai/triage";
import { applyAiSuggestionAs } from "@/lib/ai/apply";
import { checkFilingLimit, AI_RERUN_LIMIT } from "@/lib/ai/limits";
import { summarizeCaseAs } from "@/lib/ai/summarize";
import { getAiProvider, resetAiProviderForTests } from "@/lib/ai";
import type { FakeAiProvider } from "@/lib/ai/fake";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let officer: StaffUser;
let complainantId: string;
const fake = () => getAiProvider() as FakeAiProvider;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  process.env.AI_PROVIDER = "fake";
  resetAiProviderForTests();
  const s = await signInStaff("staff", `p3fix-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254712345678"));
});
beforeEach(() => {
  fake().calls.length = 0;
});

describe("known identifiers from the profile are redacted", () => {
  it("the complainant's phone on file is removed even when written oddly", async () => {
    const c = await makeCase(complainantId, {
      summary: "Advocate withheld funds",
      description: "Please call me back on 0712 34 56 78 about the money the advocate withheld.",
    });
    await triageCase(c.id);
    const sent = (fake().calls.at(-1)!.input as { text: string }).text;
    expect(sent).not.toMatch(/34\s*56\s*78/);
    expect(sent).toContain("[PHONE]");
  });
});

describe("triage does not block filing", () => {
  it("afterFiling hands triage to the scheduler instead of running it inline", async () => {
    const c = await makeCase(complainantId);
    const scheduled: (() => Promise<void>)[] = [];
    await afterFiling(c.id, (fn) => {
      scheduled.push(fn);
    });
    expect(fake().calls).toHaveLength(0);
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect((await latestAi(c.id, "triage"))?.status).toBe("ok");
  });
});

describe("apply is tied to the suggestion the officer saw", () => {
  it("applies exactly the given suggestion and rejects one from another case", async () => {
    const a = await makeCase(complainantId, { summary: "withheld funds", description: "The advocate withheld funds of KES 10,000 from me." });
    const b = await makeCase(complainantId, { summary: "delay", description: "The advocate has caused a long delay in my land transfer." });
    await triageCase(a.id);
    await triageCase(b.id);
    const seenA = (await latestAi(a.id, "triage"))!;
    const seenB = (await latestAi(b.id, "triage"))!;
    await expect(applyAiSuggestionAs(officer, a.id, seenB.id)).rejects.toThrow(/does not belong/);
    await applyAiSuggestionAs(officer, a.id, seenA.id);
    const { data } = await adminClient().from("cases").select("category").eq("id", a.id).single();
    expect(data!.category).toBe("withheld_funds");
  });
});

describe("cost limits", () => {
  it("limits re-runs and summaries per case per hour", async () => {
    const c = await makeCase(complainantId);
    for (let i = 0; i < AI_RERUN_LIMIT; i++) expect((await summarizeCaseAs(officer, c.id)).status).toBe("ok");
    expect((await summarizeCaseAs(officer, c.id)).status).toBe("rate_limited");
    expect((await triageCase(c.id, officer)).status).toBe("ok");
  });

  it("caps online filings per complainant per day", async () => {
    const { userId } = await signInAs("complainant", `+2547000${String(Date.now()).slice(-5)}`);
    expect(await checkFilingLimit(userId)).toBe(true);
    for (let i = 0; i < 5; i++) await makeCase(userId);
    expect(await checkFilingLimit(userId)).toBe(false);
  });
});
