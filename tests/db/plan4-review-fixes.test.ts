import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createActivation, startAdvocateActivation, completeAdvocateActivation } from "@/lib/advocates/activation";
import { linkAdvocateAs } from "@/lib/cases/actions";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth/otp";
import type { StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const lastCode = () => /(\d{6})/.exec(fake().sent.at(-1)!.message)![1];
const rnd = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
let officer: StaffUser;
let complainantId: string;

async function rollAdvocate() {
  const admissionNo = `P.105/FIX${rnd()}/2020`;
  const { data } = await adminClient()
    .from("advocates")
    .insert({ admission_no: admissionNo, full_name: `Fix Test ${rnd().slice(0, 4)}` })
    .select("id")
    .single();
  return { advocateId: data!.id as string, admissionNo };
}
async function caseWithCode(advocateId: string) {
  const c = await makeCase(complainantId, { advocate_id: advocateId, advocate_notified_at: new Date().toISOString() });
  return { caseId: c.id, code: await createActivation(c.id, advocateId, officer.id) };
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  delete process.env.OTP_TEST_CODE;
  const s = await signInStaff("staff", `p4fix-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700002601"));
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("activation cannot be used to lock or probe an advocate", () => {
  it("a locked code and a wrong code give the same answer", async () => {
    const a = await rollAdvocate();
    const { code } = await caseWithCode(a.advocateId);
    const phone = `07${rnd()}`;
    for (let i = 0; i < 5; i++) await startAdvocateActivation({ admissionNo: a.admissionNo, code: "ZZZZZZZZ", phone }, "en");
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code, phone }, "en")).toEqual({ ok: false, reason: "invalid" });
    const none = await rollAdvocate(); // no pending notice at all
    expect(await startAdvocateActivation({ admissionNo: none.admissionNo, code: "ZZZZZZZZ", phone }, "en")).toEqual({ ok: false, reason: "invalid" });
  });

  it("limits activation attempts per caller across admission numbers", async () => {
    const caller = `10.9.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const results = [];
    for (let i = 0; i < 11; i++) {
      const a = await rollAdvocate();
      results.push(await startAdvocateActivation({ admissionNo: a.admissionNo, code: "ZZZZZZZZ", phone: `07${rnd()}` }, "en", caller));
    }
    expect(results[10]).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("a successful first step does not spend the attempt budget", async () => {
    const a = await rollAdvocate();
    const { caseId, code } = await caseWithCode(a.advocateId);
    for (let i = 0; i < 3; i++) await startAdvocateActivation({ admissionNo: a.admissionNo, code, phone: `07${rnd()}` }, "en");
    const { data } = await adminClient().from("advocate_activations").select("attempts").eq("case_id", caseId).is("used_at", null).single();
    expect(data!.attempts).toBe(0);
  });

  it("wildcards in the admission number match nothing", async () => {
    expect(await startAdvocateActivation({ admissionNo: "%", code: "ZZZZZZZZ", phone: `07${rnd()}` }, "en")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("activation when the advocate already has an account", () => {
  it("a second notice is accepted only with the account's own phone, which signs into that account", async () => {
    const a = await rollAdvocate();
    const first = await caseWithCode(a.advocateId);
    const phone = `07${rnd()}`;
    await startAdvocateActivation({ admissionNo: a.admissionNo, code: first.code, phone }, "en");
    const r1 = await completeAdvocateActivation(phone, lastCode());
    expect(r1.ok).toBe(true);

    const second = await caseWithCode(a.advocateId);
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: second.code, phone: `07${rnd()}` }, "en")).toEqual({
      ok: false,
      reason: "already_activated",
    });
  });
});

describe("activation step 2 refuses instead of crashing", () => {
  it("if the phone became someone else's account between the steps", async () => {
    const a = await rollAdvocate();
    const { code } = await caseWithCode(a.advocateId);
    const phone = `07${rnd()}`;
    await startAdvocateActivation({ admissionNo: a.admissionNo, code, phone }, "en");
    const activationSms = lastCode();
    // Meanwhile the phone signs in at /login and becomes a complainant.
    await requestLoginCode(phone, "en");
    await verifyLoginCode(phone, lastCode());
    expect(await completeAdvocateActivation(phone, activationSms)).toEqual({ ok: false, reason: "phone_in_use" });
  });
});

describe("relinking", () => {
  it("is refused once the advocate has been notified", async () => {
    const a = await rollAdvocate();
    const b = await rollAdvocate();
    const { caseId } = await caseWithCode(a.advocateId);
    await expect(linkAdvocateAs(officer, caseId, b.advocateId)).rejects.toThrow(/already been notified/);
  });
});
