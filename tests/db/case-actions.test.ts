import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  changeStageAs,
  addNoteAs,
  assignCaseAs,
  setCategoryPriorityAs,
  requestInfoAs,
} from "@/lib/cases/actions";
import { fileComplaint } from "@/lib/cases/file-complaint";
import type { StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInStaff } from "../helpers/db";
import type { SupabaseClient } from "@supabase/supabase-js";

const fake = () => getSmsProvider() as FakeSms;
let officer: StaffUser;
let complainantId: string;
let complainantClient: SupabaseClient;

async function newCase(language: "en" | "sw" = "en") {
  const r = await fileComplaint(
    {
      advocateNameGiven: "Workflow Test Advocate",
      summary: "Case actions test complaint",
      description: "This complaint exists to exercise stage changes, notes and assignment.",
      language,
      consentDataProcessing: true,
    },
    [],
    { complainantId, filedBy: complainantId, channel: "online", locale: language },
  );
  fake().sent.length = 0;
  return r;
}

const events = async (caseId: string, type: string) =>
  (await adminClient().from("case_events").select("type,visibility,body").eq("case_id", caseId).eq("type", type)).data!;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const s = await signInStaff("staff", `actions-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null, office: "Nairobi" };
  const c = await signInAs("complainant", "+254700001201");
  complainantId = c.userId;
  complainantClient = c.client;
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("changeStage", () => {
  it("moves the stage, records one parties event and texts the complainant in their language", async () => {
    const c = await newCase("sw");
    expect(await changeStageAs(officer, c.caseId, "received", "screening")).toEqual({ ok: true });
    const { data } = await adminClient().from("cases").select("stage").eq("id", c.caseId).single();
    expect(data!.stage).toBe("screening");
    const ev = await events(c.caseId, "stage_changed");
    expect(ev).toEqual([{ type: "stage_changed", visibility: "parties", body: { from: "received", to: "screening" } }]);
    expect(fake().sent).toHaveLength(1);
    expect(fake().sent[0].message).toContain(c.caseNumber);
    expect(fake().sent[0].message).toContain("Uchunguzi wa awali");
  });

  it("refuses a move that is not allowed and writes nothing", async () => {
    const c = await newCase();
    expect(await changeStageAs(officer, c.caseId, "received", "hearing")).toEqual({ ok: false, reason: "not_allowed" });
    expect(await events(c.caseId, "stage_changed")).toEqual([]);
    expect(fake().sent).toHaveLength(0);
  });

  it("requires a reason to close", async () => {
    const c = await newCase();
    await changeStageAs(officer, c.caseId, "received", "screening");
    expect(await changeStageAs(officer, c.caseId, "screening", "closed")).toEqual({ ok: false, reason: "reason_required" });
    expect(await changeStageAs(officer, c.caseId, "screening", "closed", "Outside ACC jurisdiction")).toEqual({ ok: true });
  });

  it("only one of two simultaneous changes applies", async () => {
    const c = await newCase();
    const results = await Promise.all([
      changeStageAs(officer, c.caseId, "received", "screening"),
      changeStageAs(officer, c.caseId, "received", "screening"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "stale")).toHaveLength(1);
    expect(await events(c.caseId, "stage_changed")).toHaveLength(1);
  });

  it("returns stale when the stage already moved", async () => {
    const c = await newCase();
    await changeStageAs(officer, c.caseId, "received", "screening");
    expect(await changeStageAs(officer, c.caseId, "received", "screening")).toEqual({ ok: false, reason: "stale" });
  });
});

describe("notes, assignment, triage, info requests", () => {
  it("notes are internal and hidden from the complainant", async () => {
    const c = await newCase();
    await addNoteAs(officer, c.caseId, "Called the advocate's office; no answer.");
    expect(await events(c.caseId, "note")).toEqual([
      { type: "note", visibility: "internal", body: { text: "Called the advocate's office; no answer." } },
    ]);
    const { data } = await complainantClient.from("case_events").select("type").eq("case_id", c.caseId);
    expect(data!.map((e) => e.type)).not.toContain("note");
  });

  it("rejects an empty note", async () => {
    const c = await newCase();
    await expect(addNoteAs(officer, c.caseId, "   ")).rejects.toThrow();
  });

  it("assigns only to staff or admin", async () => {
    const c = await newCase();
    await assignCaseAs(officer, c.caseId, officer.id);
    const { data } = await adminClient().from("cases").select("assigned_officer_id").eq("id", c.caseId).single();
    expect(data!.assigned_officer_id).toBe(officer.id);
    await expect(assignCaseAs(officer, c.caseId, complainantId)).rejects.toThrow();
  });

  it("sets category and priority from the configured list", async () => {
    const c = await newCase();
    await setCategoryPriorityAs(officer, c.caseId, "withheld_funds", "high");
    const { data } = await adminClient().from("cases").select("category,priority").eq("id", c.caseId).single();
    expect(data).toEqual({ category: "withheld_funds", priority: "high" });
    await expect(setCategoryPriorityAs(officer, c.caseId, "made_up", "high")).rejects.toThrow();
  });

  it("requests information: parties event with due date and an SMS", async () => {
    const c = await newCase();
    await requestInfoAs(officer, c.caseId, "Please upload the fee agreement you signed.", 7);
    const ev = await events(c.caseId, "info_requested");
    expect(ev).toHaveLength(1);
    expect(ev[0].visibility).toBe("parties");
    expect(ev[0].body.message).toBe("Please upload the fee agreement you signed.");
    expect(new Date(ev[0].body.due_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);
    expect(fake().sent).toHaveLength(1);
    expect(fake().sent[0].message).toContain(c.caseNumber);
  });
});
