import { describe, it, expect, beforeAll } from "vitest";
import { staffGate } from "@/lib/auth/staff-gate";
import { setUserActiveAs } from "@/lib/admin/users";
import { changeStageAs, addNoteAs, assignCaseAs, setCategoryPriorityAs, requestInfoAs } from "@/lib/cases/actions";
import { fileWalkInComplaintAs } from "@/lib/cases/walk-in";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let adminUser: StaffUser;
let officer: StaffUser;
let complainantId: string;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const stamp = Date.now();
  const a = await signInStaff("admin", `fix-admin-${stamp}@test.mizani.local`);
  adminUser = { id: a.userId, role: "admin", phone: null };
  const o = await signInStaff("staff", `fix-officer-${stamp}@test.mizani.local`);
  officer = { id: o.userId, role: "staff", phone: null, office: "Nairobi" };
  ({ userId: complainantId } = await signInAs("complainant", "+254700001701"));
});

describe("deactivated staff lose access immediately", () => {
  it("staffGate sends an inactive staff user to login", () => {
    expect(staffGate({ id: "x", role: "staff", phone: null, active: false }, "aal2")).toBe("login");
  });

  it("an already signed-in officer can no longer read staff data once deactivated", async () => {
    const s = await signInStaff("staff", `fix-leaver-${Date.now()}@test.mizani.local`);
    const c = await makeCase(complainantId);
    expect((await s.client.from("staff_cases").select("id").eq("id", c.id)).data).toHaveLength(1);
    await setUserActiveAs(adminUser, s.userId, false);
    expect((await s.client.from("staff_cases").select("id").eq("id", c.id)).data ?? []).toEqual([]);
    expect((await s.client.from("case_events").select("id").eq("case_id", c.id)).data ?? []).toEqual([]);
  });
});

describe("staff changes are attributed in the audit log", () => {
  it("records the officer as actor for each case action", async () => {
    const c = await makeCase(complainantId);
    await changeStageAs(officer, c.id, "received", "screening");
    await addNoteAs(officer, c.id, "Attributed note");
    await assignCaseAs(officer, c.id, officer.id);
    await setCategoryPriorityAs(officer, c.id, "delay", "high");
    await requestInfoAs(officer, c.id, "Please send the fee note.", 5);
    const { data } = await adminClient()
      .from("audit_log")
      .select("action")
      .eq("entity_id", c.id)
      .eq("actor_id", officer.id);
    expect(data!.map((r) => r.action).sort()).toEqual(
      ["add_note", "assign_case", "change_stage", "request_info", "triage_case"].sort(),
    );
  });

  it("records the officer as actor for a walk-in filing", async () => {
    const r = await fileWalkInComplaintAs(
      officer,
      {
        fullName: "Audit Walk-in",
        advocateNameGiven: "Audit Advocate",
        summary: "Walk-in audit attribution test",
        description: "Checking that the officer who filed a walk-in complaint is in the audit log.",
        language: "en",
        consentDataProcessing: true,
      },
      [],
    );
    const { data } = await adminClient()
      .from("audit_log")
      .select("action")
      .eq("entity_id", r.caseId)
      .eq("actor_id", officer.id);
    expect(data!.map((x) => x.action)).toContain("file_walk_in");
  });
});

describe("walk-in phone must be confirmed", () => {
  it("rejects a phone whose confirmation does not match, before creating anything", async () => {
    const before = await adminClient().from("profiles").select("id", { count: "exact", head: true }).eq("phone", "+254700001799");
    await expect(
      fileWalkInComplaintAs(
        officer,
        {
          fullName: "Typo Person",
          phone: "0700001799",
          phoneConfirm: "0700001798",
          advocateNameGiven: "Typo Advocate",
          summary: "Phone confirmation mismatch test",
          description: "The officer typed the phone number differently the second time.",
          language: "en",
          consentDataProcessing: true,
        },
        [],
      ),
    ).rejects.toMatchObject({ reason: "invalid_input", fields: ["phoneConfirm"] });
    const after = await adminClient().from("profiles").select("id", { count: "exact", head: true }).eq("phone", "+254700001799");
    expect(after.count).toBe(before.count);
  });

  it("accepts the same number written differently", async () => {
    const r = await fileWalkInComplaintAs(
      officer,
      {
        fullName: "Format Person",
        phone: "0700001798",
        phoneConfirm: "+254 700 001 798",
        advocateNameGiven: "Format Advocate",
        summary: "Phone confirmation format test",
        description: "Same number entered in two formats should be accepted by intake.",
        language: "en",
        consentDataProcessing: true,
      },
      [],
    );
    expect(r.caseNumber).toMatch(/^ACC\//);
  });
});
