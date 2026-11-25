import { describe, it, expect, beforeAll } from "vitest";
import { openStageDeadline, addDeadline, meetDeadlines, sweepDeadlines } from "@/lib/cases/deadlines";
import { changeStageAs } from "@/lib/cases/actions";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let officer: StaffUser;
let complainantId: string;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const s = await signInStaff("staff", `deadlines-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  await signInStaff("admin", `deadlines-admin-${Date.now()}@test.mizani.local`);
  ({ userId: complainantId } = await signInAs("complainant", "+254700001401"));
});

const deadlines = async (caseId: string) =>
  (await adminClient().from("case_deadlines").select("id,kind,stage,due_at,met_at").eq("case_id", caseId).order("created_at")).data!;
const notes = async (deadlineId: string) =>
  (await adminClient().from("notifications").select("user_id,kind").eq("deadline_id", deadlineId)).data!;

describe("stage deadlines", () => {
  it("a stage change closes the old deadline and opens one with the stage's SLA", async () => {
    const c = await makeCase(complainantId);
    await openStageDeadline(c.id, "received");
    await changeStageAs(officer, c.id, "received", "screening");
    const d = await deadlines(c.id);
    expect(d.map((x) => [x.stage, x.met_at !== null])).toEqual([
      ["received", true],
      ["screening", false],
    ]);
    const days = (new Date(d[1].due_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("closing a case opens no new deadline", async () => {
    const c = await makeCase(complainantId, { stage: "decision" });
    await openStageDeadline(c.id, "decision");
    await changeStageAs(officer, c.id, "decision", "closed", "Decision delivered");
    const d = await deadlines(c.id);
    expect(d.every((x) => x.met_at !== null)).toBe(true);
  });

  it("meetDeadlines marks only that kind as met", async () => {
    const c = await makeCase(complainantId);
    await openStageDeadline(c.id, "received");
    await addDeadline(c.id, "info_request", new Date(Date.now() + 86_400_000));
    await meetDeadlines(c.id, "info_request");
    const d = await deadlines(c.id);
    expect(d.find((x) => x.kind === "info_request")!.met_at).not.toBeNull();
    expect(d.find((x) => x.kind === "stage")!.met_at).toBeNull();
  });
});

describe("sweepDeadlines", () => {
  it("notifies the assigned officer once when due soon, once more when overdue", async () => {
    const c = await makeCase(complainantId, { assigned_officer_id: officer.id });
    const due = new Date(Date.now() + 3 * 86_400_000);
    const id = await addDeadline(c.id, "stage", due);

    await sweepDeadlines(new Date(due.getTime() - 24 * 3600_000), { caseId: c.id });
    await sweepDeadlines(new Date(due.getTime() - 23 * 3600_000), { caseId: c.id });
    expect(await notes(id)).toEqual([{ user_id: officer.id, kind: "due_soon" }]);

    await sweepDeadlines(new Date(due.getTime() + 3600_000), { caseId: c.id });
    expect((await notes(id)).map((n) => n.kind).sort()).toEqual(["due_soon", "overdue"]);
  });

  it("notifies active admins when the case is unassigned", async () => {
    const c = await makeCase(complainantId);
    const id = await addDeadline(c.id, "stage", new Date(Date.now() - 3600_000));
    await sweepDeadlines(new Date(), { caseId: c.id });
    const n = await notes(id);
    expect(n.length).toBeGreaterThan(0);
    const { data: roles } = await adminClient().from("profiles").select("role").in("id", n.map((x) => x.user_id));
    expect(roles!.every((r) => r.role === "admin")).toBe(true);
  });

  it("ignores deadlines already met", async () => {
    const c = await makeCase(complainantId, { assigned_officer_id: officer.id });
    const id = await addDeadline(c.id, "stage", new Date(Date.now() - 3600_000));
    await meetDeadlines(c.id, "stage");
    await sweepDeadlines(new Date(), { caseId: c.id });
    expect(await notes(id)).toEqual([]);
  });
});
