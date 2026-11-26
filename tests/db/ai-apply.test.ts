import { describe, it, expect, beforeAll } from "vitest";
import { applyAiSuggestionAs } from "@/lib/ai/apply";
import { triageCase } from "@/lib/ai/triage";
import { resetAiProviderForTests } from "@/lib/ai";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let officer: StaffUser;
let commissioner: StaffUser;
let complainantId: string;

beforeAll(async () => {
  process.env.AI_PROVIDER = "fake";
  resetAiProviderForTests();
  const s = await signInStaff("staff", `apply-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  const c = await signInStaff("commissioner", `apply-comm-${Date.now()}@test.mizani.local`);
  commissioner = { id: c.userId, role: "commissioner", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700002101"));
});

async function triagedCase() {
  const c = await makeCase(complainantId, {
    summary: "Advocate withheld funds from my land sale",
    description: "The advocate withheld funds of KES 900,000 from the sale of my land.",
  });
  await triageCase(c.id);
  return c;
}

describe("applyAiSuggestionAs", () => {
  it("copies the suggested category and priority onto the case and audits it", async () => {
    const c = await triagedCase();
    await applyAiSuggestionAs(officer, c.id);
    const admin = adminClient();
    const { data } = await admin.from("cases").select("category,priority").eq("id", c.id).single();
    expect(data).toEqual({ category: "withheld_funds", priority: "high" });
    const { data: audit } = await admin
      .from("audit_log")
      .select("actor_id")
      .eq("entity_id", c.id)
      .eq("action", "ai_suggestion_applied");
    expect(audit).toEqual([{ actor_id: officer.id }]);
  });

  it("refuses a commissioner (read-only) and changes nothing", async () => {
    const c = await triagedCase();
    await expect(applyAiSuggestionAs(commissioner, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    const { data } = await adminClient().from("cases").select("category").eq("id", c.id).single();
    expect(data!.category).toBeNull();
  });

  it("fails cleanly when there is no usable suggestion", async () => {
    const c = await makeCase(complainantId);
    await expect(applyAiSuggestionAs(officer, c.id)).rejects.toThrow(/no AI suggestion/);
  });
});
