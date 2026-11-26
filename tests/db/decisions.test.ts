import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDecisionAs } from "@/lib/commission/decisions";
import { updateReferralAs } from "@/lib/commission/referrals";
import { buildDecisionLetter } from "@/lib/commission/decision-letter";
import { extractPdfText } from "@/lib/ai/document-text";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInAdvocate, signInStaff, makeCase } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const reasons = "Having heard both parties, the panel finds that the advocate received KES 40,000 and did not account for it.";
let officer: StaffUser;
let comm: StaffUser;
let otherComm: StaffUser;
let complainant: { client: SupabaseClient; userId: string };
let advocate: { client: SupabaseClient; userId: string; advocateId: string };
const advPhone = `+25470009${String(Date.now()).slice(-4)}`;

async function hearingCase() {
  const c = await makeCase(complainant.userId, {
    advocate_id: advocate.advocateId,
    advocate_notified_at: new Date().toISOString(),
    stage: "hearing",
  });
  fake().sent.length = 0;
  return c;
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const stamp = Date.now();
  const o = await signInStaff("staff", `dec-off-${stamp}@test.mizani.local`);
  officer = { id: o.userId, role: "staff", phone: null };
  const c1 = await signInStaff("commissioner", `dec-c1-${stamp}@test.mizani.local`);
  comm = { id: c1.userId, role: "commissioner", phone: null, full_name: "Commissioner One" };
  const c2 = await signInStaff("commissioner", `dec-c2-${stamp}@test.mizani.local`);
  otherComm = { id: c2.userId, role: "commissioner", phone: null };
  complainant = await signInAs("complainant", "+254700003001");
  advocate = await signInAdvocate(advPhone);
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("recordDecisionAs", () => {
  it("records a refund order, moves to decision, publishes reasons to both parties and texts them", async () => {
    const c = await hearingCase();
    const r = await recordDecisionAs(comm, c.id, { outcome: "refund_ordered", reasons, orders: "Refund within 30 days.", amountKes: 40000, panel: [comm.id] });
    expect(r.referralId).toBeNull();
    const admin = adminClient();
    expect((await admin.from("cases").select("stage").eq("id", c.id).single()).data!.stage).toBe("decision");
    for (const client of [complainant.client, advocate.client]) {
      const { data } = await client.from("case_events").select("body").eq("case_id", c.id).eq("type", "decision_issued").single();
      expect(data!.body).toMatchObject({ outcome: "refund_ordered", reasons, orders: "Refund within 30 days.", amount_kes: 40000 });
    }
    expect(fake().sent.map((m) => m.to).sort()).toEqual([advPhone, "+254700003001"].sort());
    const { data: audit } = await admin.from("audit_log").select("actor_id").eq("entity_id", c.id).eq("action", "record_decision");
    expect(audit).toEqual([{ actor_id: comm.id }]);
  });

  it("validates: amount for refunds, reasons length, role, panel membership, stage", async () => {
    const c = await hearingCase();
    await expect(recordDecisionAs(comm, c.id, { outcome: "refund_ordered", reasons, panel: [comm.id] })).rejects.toThrow(/amount/);
    await expect(recordDecisionAs(comm, c.id, { outcome: "dismissed", reasons: "Too short.", panel: [comm.id] })).rejects.toThrow(/reasons/);
    await expect(recordDecisionAs(officer, c.id, { outcome: "dismissed", reasons, panel: [comm.id] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordDecisionAs(otherComm, c.id, { outcome: "dismissed", reasons, panel: [comm.id] })).rejects.toThrow(/panel/);
    const early = await makeCase(complainant.userId, { stage: "investigation" });
    await expect(recordDecisionAs(comm, early.id, { outcome: "dismissed", reasons, panel: [comm.id] })).rejects.toThrow(/stage/);
  });

  it("a correction supersedes the earlier decision and is marked as corrected", async () => {
    const c = await hearingCase();
    const first = await recordDecisionAs(comm, c.id, { outcome: "admonished", reasons, panel: [comm.id] });
    const second = await recordDecisionAs(comm, c.id, { outcome: "dismissed", reasons: `${reasons} On review, the complaint is dismissed.`, panel: [comm.id] });
    const admin = adminClient();
    const { data: d } = await admin.from("decisions").select("id,superseded_by").eq("case_id", c.id);
    expect(d!.find((x) => x.id === first.decisionId)!.superseded_by).toBe(second.decisionId);
    expect(d!.find((x) => x.id === second.decisionId)!.superseded_by).toBeNull();
    const { data: ev } = await admin.from("case_events").select("body").eq("case_id", c.id).eq("type", "decision_issued").order("created_at");
    expect(ev!.at(-1)!.body).toMatchObject({ outcome: "dismissed", corrected: true });
    const { data: audit } = await admin.from("audit_log").select("details").eq("entity_id", c.id).eq("action", "record_decision").order("at");
    expect(audit!.at(-1)!.details).toMatchObject({ before: { outcome: "admonished" }, after: { outcome: "dismissed" } });
  });

  it("a tribunal referral creates a prepared referral that officers can lodge", async () => {
    const c = await hearingCase();
    const r = await recordDecisionAs(comm, c.id, { outcome: "referred_to_tribunal", reasons, panel: [comm.id] });
    expect(r.referralId).toBeTruthy();
    await expect(updateReferralAs(comm, r.referralId!, { status: "lodged" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateReferralAs(officer, r.referralId!, { status: "lodged", tribunalReference: "DT/2026/0042" });
    const { data } = await adminClient().from("referrals").select("status,tribunal_reference").eq("id", r.referralId!).single();
    expect(data).toEqual({ status: "lodged", tribunal_reference: "DT/2026/0042" });
  });
});

describe("decision letter", () => {
  it("states outcome, reasons, orders and amount in both languages", async () => {
    const c = await hearingCase();
    const { decisionId } = await recordDecisionAs(comm, c.id, { outcome: "refund_ordered", reasons, orders: "Refund within 30 days.", amountKes: 40000, panel: [comm.id] });
    const text = (await extractPdfText(await buildDecisionLetter(decisionId)))!;
    for (const s of [c.case_number, "Refund ordered", reasons.slice(0, 40), "Refund within 30 days.", "40,000", "Uamuzi"]) expect(text).toContain(s);
  });
});
