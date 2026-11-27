import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, makeCase, signInAs, signInStaff } from "../helpers/db";

const DAY = 86_400_000;
const stamp = Date.now();
let n = 0;
const office = () => `Analytics-${stamp}-${++n}`;
const base = Date.now() - 60 * DAY;
const at = (days: number) => new Date(base + days * DAY).toISOString();
const PERIOD = { p_from: new Date(Date.now() - 365 * DAY).toISOString(), p_to: new Date(Date.now() + DAY).toISOString() };
let complainantId: string;

async function caseIn(off: string, overrides: Record<string, unknown> = {}) {
  return makeCase(complainantId, { office: off, created_at: at(0), ...overrides });
}

async function moves(caseId: string, steps: [string, string, number][]) {
  const { error } = await adminClient()
    .from("case_events")
    .insert(steps.map(([from, to, d]) => ({ case_id: caseId, type: "stage_changed", visibility: "parties", body: { from, to }, created_at: at(d) })));
  if (error) throw error;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

beforeAll(async () => {
  complainantId = (await signInAs("complainant", "+254700004001")).userId;
});

describe("analytics_overview", () => {
  it("overview counts filings, closures, median resolution and deadline compliance", async () => {
    const off = office();
    const a = await caseIn(off, { stage: "closed" });
    const b = await caseIn(off, { stage: "closed", language: "sw" });
    const c = await caseIn(off, { stage: "investigation", channel: "walk_in" });
    await moves(a.id, [["received", "closed", 10]]);
    await moves(b.id, [["received", "closed", 20]]);
    await adminClient().from("case_deadlines").insert([
      { case_id: c.id, kind: "stage", stage: "investigation", due_at: at(5), met_at: at(4) },
      { case_id: c.id, kind: "stage", stage: "investigation", due_at: at(6), met_at: at(8) },
    ]);
    const o = await rpc<Record<string, unknown>>("analytics_overview", { ...PERIOD, p_office: off });
    expect(o).toMatchObject({
      filed: 3,
      filed_online: 2,
      filed_walk_in: 1,
      filed_sw: 1,
      closed: 2,
      open_now: 1,
      median_resolution_days: 15,
      deadlines_due: 2,
      deadlines_met: 1,
      decisions: 0,
    });
  });

  it("a reopened case uses its latest close", async () => {
    const off = office();
    const c = await caseIn(off, { stage: "closed" });
    await moves(c.id, [
      ["received", "closed", 5],
      ["closed", "investigation", 6],
      ["investigation", "closed", 30],
    ]);
    const o = await rpc<Record<string, unknown>>("analytics_overview", { ...PERIOD, p_office: off });
    expect(o).toMatchObject({ closed: 1, median_resolution_days: 30 });
  });
});

describe("empty office", () => {
  it("an empty office gives zeros and nulls, never an error", async () => {
    const args = { ...PERIOD, p_office: office() };
    const o = await rpc<Record<string, unknown>>("analytics_overview", args);
    expect(o).toMatchObject({ filed: 0, closed: 0, median_resolution_days: null, deadlines_due: 0, refunds_kes: 0 });
    const stages = await rpc<{ stage: string; entered: number; median_days: number | null }[]>("analytics_stage_times", args);
    expect(stages.map((s) => s.stage)).toEqual(["received", "screening", "advocate_notified", "investigation", "conciliation", "hearing", "decision"]);
    expect(stages.every((s) => s.entered === 0 && s.median_days === null)).toBe(true);
    expect(await rpc("analytics_officers", args)).toEqual([]);
    expect(await rpc("analytics_categories", args)).toEqual([]);
    expect(await rpc("analytics_repeat_advocates", args)).toEqual([]);
  });
});

describe("analytics_stage_times", () => {
  it("stage times count every stay, including moves back", async () => {
    const off = office();
    const c = await caseIn(off, { stage: "decision" });
    await moves(c.id, [
      ["received", "screening", 2],
      ["screening", "investigation", 5],
      ["investigation", "hearing", 9],
      ["hearing", "investigation", 10],
      ["investigation", "hearing", 14],
      ["hearing", "decision", 15],
    ]);
    const rows = await rpc<{ stage: string; entered: number; median_days: number | null; open_now: number }[]>("analytics_stage_times", {
      ...PERIOD,
      p_office: off,
    });
    const by = Object.fromEntries(rows.map((r) => [r.stage, r]));
    expect(by.received).toMatchObject({ entered: 1, median_days: 2 });
    expect(by.screening).toMatchObject({ entered: 1, median_days: 3 });
    expect(by.investigation).toMatchObject({ entered: 2, median_days: 4 });
    expect(by.hearing).toMatchObject({ entered: 2, median_days: 1 });
    expect(by.decision).toMatchObject({ entered: 1, median_days: null, open_now: 1 });
  });
});

describe("analytics_categories", () => {
  it("months are Nairobi months", async () => {
    const off = office();
    await caseIn(off, { created_at: "2026-03-31T22:30:00Z", category: "delay" });
    const rows = await rpc<{ month: string; category: string; filed: number }[]>("analytics_categories", {
      p_from: "2026-03-01T00:00:00Z",
      p_to: "2026-05-01T00:00:00Z",
      p_office: off,
    });
    expect(rows).toEqual([{ month: "2026-04-01", category: "delay", filed: 1 }]);
  });
});

describe("analytics_repeat_advocates", () => {
  it("repeat advocates need p_min complaints and count upheld and referred decisions", async () => {
    const off = office();
    const admin = adminClient();
    const { data: advs, error } = await admin
      .from("advocates")
      .insert([
        { admission_no: `P.105/AN${stamp}A/2010`, full_name: `Analytics Advocate A ${stamp}`, phone: "+254700004101" },
        { admission_no: `P.105/AN${stamp}B/2011`, full_name: `Analytics Advocate B ${stamp}`, phone: "+254700004102" },
      ])
      .select("id");
    if (error) throw error;
    const [A, B] = advs!.map((a) => a.id as string);
    const reasons = "Having heard both parties, the panel finds the complaint substantiated on the evidence.";
    const decide = async (caseId: string, outcome: string, extra: Record<string, unknown> = {}) => {
      const { data, error: e } = await admin
        .from("decisions")
        .insert({ case_id: caseId, outcome, reasons, panel: [complainantId], decided_at: at(20), ...extra })
        .select("id")
        .single();
      if (e) throw e;
      return data.id as string;
    };
    const c1 = await caseIn(off, { advocate_id: A, stage: "decision" });
    const c2 = await caseIn(off, { advocate_id: A, stage: "decision" });
    const c3 = await caseIn(off, { advocate_id: A, stage: "decision" });
    await caseIn(off, { advocate_id: B });
    await decide(c1.id, "refund_ordered", { amount_kes: 1000 });
    await decide(c2.id, "referred_to_tribunal");
    const admonished = await decide(c3.id, "admonished");
    await decide(c3.id, "dismissed", { superseded_by: admonished, decided_at: at(19) });

    const rows = await rpc<Record<string, unknown>[]>("analytics_repeat_advocates", { ...PERIOD, p_office: off, p_min: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ advocate_id: A, complaints: 3, upheld: 3, referred: 1 });
    expect(rows.some((r) => r.advocate_id === B)).toBe(false);
  });
});

describe("analytics_officers", () => {
  it("officers show workload for active officers in the office", async () => {
    const off = office();
    const o = await signInStaff("staff", `an-off-${stamp}@test.mizani.local`, off);
    const open1 = await caseIn(off, { assigned_officer_id: o.userId, stage: "investigation" });
    await caseIn(off, { assigned_officer_id: o.userId, stage: "investigation" });
    const done = await caseIn(off, { assigned_officer_id: o.userId, stage: "closed" });
    await moves(done.id, [["received", "closed", 12]]);
    await adminClient().from("case_deadlines").insert({ case_id: open1.id, kind: "stage", stage: "investigation", due_at: at(3) });
    const rows = await rpc<Record<string, unknown>[]>("analytics_officers", { ...PERIOD, p_office: off });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ officer_id: o.userId, open_now: 2, assigned_in_period: 3, closed_in_period: 1, overdue_now: 1 });
  });
});

describe("access", () => {
  it("only service_role may call the functions", async () => {
    const { client } = await signInAs("complainant", "+254700004002");
    const { error } = await client.rpc("analytics_overview", { ...PERIOD, p_office: null });
    expect(error).not.toBeNull();
  });
});
