import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createActivation, startAdvocateActivation, completeAdvocateActivation } from "@/lib/advocates/activation";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth/otp";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const lastCode = () => /(\d{6})/.exec(fake().sent.at(-1)!.message)![1];
const rnd = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
let complainantId: string;
let staffId: string;

async function rollAdvocate() {
  const admissionNo = `P.105/ACT${rnd()}/2020`;
  const { data } = await adminClient()
    .from("advocates")
    .insert({ admission_no: admissionNo, full_name: `Activation Test ${rnd().slice(0, 4)}` })
    .select("id")
    .single();
  return { advocateId: data!.id as string, admissionNo };
}

async function notifiedCaseWithCode() {
  const adv = await rollAdvocate();
  const c = await makeCase(complainantId, { advocate_id: adv.advocateId, advocate_notified_at: new Date().toISOString() });
  const code = await createActivation(c.id, adv.advocateId, staffId);
  return { ...adv, caseId: c.id, code };
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  delete process.env.OTP_TEST_CODE;
  ({ userId: complainantId } = await signInAs("complainant", "+254700002301"));
  ({ userId: staffId } = await signInStaff("staff", `activation-${Date.now()}@test.mizani.local`));
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("advocate activation", () => {
  it("admission number + code + fresh phone → SMS code → advocate account linked to the roll", async () => {
    const a = await notifiedCaseWithCode();
    const phone = `07${rnd()}`;
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo.toLowerCase(), code: a.code.toLowerCase(), phone }, "en")).toEqual({ ok: true });
    const r = await completeAdvocateActivation(phone, lastCode());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.role).toBe("advocate");
    const admin = adminClient();
    const { data: adv } = await admin.from("advocates").select("profile_id").eq("id", a.advocateId).single();
    expect(adv!.profile_id).toBe(r.userId);
    const { data: p } = await admin.from("profiles").select("role,phone").eq("id", r.userId).single();
    expect(p).toEqual({ role: "advocate", phone: `+254${phone.slice(1)}` });

    // Later sign-ins with that phone land in the advocate portal.
    await requestLoginCode(phone, "en");
    const again = await verifyLoginCode(phone, lastCode());
    expect(again.ok && again.role).toBe("advocate");
    expect(again.ok && again.userId).toBe(r.userId);
  });

  it("locks after 5 wrong codes, even when the right one follows", async () => {
    const a = await notifiedCaseWithCode();
    const phone = `07${rnd()}`;
    for (let i = 0; i < 5; i++) await startAdvocateActivation({ admissionNo: a.admissionNo, code: "ZZZZZZZZ", phone }, "en");
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone }, "en")).toEqual({ ok: false, reason: "invalid" });
  });

  it("a used code no longer works", async () => {
    const a = await notifiedCaseWithCode();
    const phone = `07${rnd()}`;
    await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone }, "en");
    await completeAdvocateActivation(phone, lastCode());
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone: `07${rnd()}` }, "en")).toEqual({ ok: false, reason: "invalid" });
  });

  it("an expired code does not work", async () => {
    const a = await notifiedCaseWithCode();
    await adminClient().from("advocate_activations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("case_id", a.caseId);
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone: `07${rnd()}` }, "en")).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a phone that already belongs to a complainant", async () => {
    const a = await notifiedCaseWithCode();
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone: "0700002301" }, "en")).toEqual({ ok: false, reason: "phone_in_use" });
  });

  it("a complainant's own sign-in is unaffected", async () => {
    // This fixed phone is reused by every run; clear its earlier codes so the daily send limit (8) is not hit.
    await adminClient().from("login_codes").delete().eq("phone", "+254700002301");
    await requestLoginCode("0700002301", "en");
    const r = await verifyLoginCode("0700002301", lastCode());
    expect(r.ok && r.role).toBe("complainant");
    expect(r.ok && r.userId).toBe(complainantId);
  });

  it("re-notifying replaces the earlier code", async () => {
    const a = await notifiedCaseWithCode();
    const newer = await createActivation(a.caseId, a.advocateId, staffId);
    expect(await startAdvocateActivation({ admissionNo: a.admissionNo, code: a.code, phone: `07${rnd()}` }, "en")).toEqual({ ok: false, reason: "invalid" });
    expect((await startAdvocateActivation({ admissionNo: a.admissionNo, code: newer, phone: `07${rnd()}` }, "en")).ok).toBe(true);
  });
});
