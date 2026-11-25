import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requestLoginCode, verifyLoginCode, phoneEmail } from "@/lib/auth/otp";
import { checkStatus } from "@/lib/cases/status-check";
import { fileComplaint } from "@/lib/cases/file-complaint";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const rand = () => `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
const ip = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
const lastCode = () => /(\d{6})/.exec(fake().sent.at(-1)!.message)![1];

beforeEach(() => {
  process.env.SMS_PROVIDER = "fake";
  delete process.env.OTP_TEST_CODE;
  delete process.env.VERCEL;
  fake().sent.length = 0;
});
afterEach(() => {
  delete process.env.OTP_TEST_CODE;
  delete process.env.VERCEL;
});

describe("login code hardening", () => {
  it("parallel wrong guesses cannot exceed 5 attempts", async () => {
    const phone = rand();
    await requestLoginCode(phone, "en", ip());
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 20 }, () => verifyLoginCode(phone, wrong)));
    const { data } = await adminClient()
      .from("login_codes")
      .select("attempts")
      .eq("phone", `+254${phone.slice(1)}`)
      .single();
    expect(data!.attempts).toBeLessThanOrEqual(5);
    expect(await verifyLoginCode(phone, code)).toEqual({ ok: false, reason: "invalid_code" });
  });

  it("parallel code requests cannot exceed 3 per 10 minutes", async () => {
    const phone = rand();
    const results = await Promise.all(Array.from({ length: 10 }, () => requestLoginCode(phone, "en", ip())));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(fake().sent).toHaveLength(3);
  });

  it("limits code requests per caller IP across many phone numbers", async () => {
    const caller = ip();
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await requestLoginCode(rand(), "en", caller));
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("ignores OTP_TEST_CODE on Vercel deployments", async () => {
    process.env.OTP_TEST_CODE = "123456";
    process.env.VERCEL = "1";
    await requestLoginCode(rand(), "en", ip());
    // A random code collides with 123456 one time in a million.
    expect(fake().sent.at(-1)!.message).not.toContain("123456");
  });

  it("logs in a phone whose auth user already exists without a profile", async () => {
    const phone = rand();
    const e164 = `+254${phone.slice(1)}`;
    const pre = await adminClient().auth.admin.createUser({ email: phoneEmail(e164), email_confirm: true });
    await requestLoginCode(phone, "en", ip());
    const r = await verifyLoginCode(phone, lastCode());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe(pre.data.user!.id);
  });
});

describe("status check hardening", () => {
  let caseNumber: string;
  let pin: string;

  beforeEach(async () => {
    const { userId } = await signInAs("complainant", "+254700000901");
    ({ caseNumber, pin } = await fileComplaint(
      {
        advocateNameGiven: "Lockout Test",
        summary: "Lockout race condition test",
        description: "Ensuring parallel wrong PINs cannot bypass the five-failure lockout.",
        language: "en",
        consentDataProcessing: true,
      },
      [],
      { complainantId: userId, filedBy: userId, channel: "online", locale: "en" },
    ));
  });

  it("parallel wrong PINs from one caller still lock that caller", async () => {
    const wrong = pin === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 20 }, () => checkStatus(caseNumber, wrong, "ussd", "+254711000001")));
    expect(await checkStatus(caseNumber, pin, "ussd", "+254711000001")).toEqual({ ok: false, reason: "locked" });
  });

  it("one caller's failures do not lock out a different caller", async () => {
    const wrong = pin === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await checkStatus(caseNumber, wrong, "ussd", "+254711000002");
    expect(await checkStatus(caseNumber, pin, "ussd", "+254711000003")).toMatchObject({ ok: true });
  });
});

describe("database write lockdown", () => {
  it("a complainant cannot insert a case row directly", async () => {
    const { client, userId } = await signInAs("complainant", "+254700000902");
    const { error } = await client.from("cases").insert({
      case_number: "ACC/2099/000001",
      complainant_id: userId,
      filed_by: userId,
      advocate_name_given: "X",
      summary: "squatting a case number",
      description: "attempting to reserve a future case number directly",
      language: "en",
      channel: "online",
      pin_hash: "x",
      stage: "closed",
    });
    expect(error).not.toBeNull();
  });

  it("a complainant cannot insert timeline events or documents", async () => {
    const { client } = await signInAs("complainant", "+254700000902");
    const ev = await client.from("case_events").insert({ case_id: crypto.randomUUID(), type: "x", visibility: "parties" });
    expect(ev.error).not.toBeNull();
  });

  it("a complainant cannot change their phone or role, but can change their name", async () => {
    const { client, userId } = await signInAs("complainant", "+254700000903");
    await client.from("profiles").update({ phone: "+254799999999" }).eq("id", userId);
    await client.from("profiles").update({ role: "admin" }).eq("id", userId);
    const nameUpd = await client.from("profiles").update({ full_name: "Renamed" }).eq("id", userId);
    expect(nameUpd.error).toBeNull();
    const { data } = await adminClient().from("profiles").select("phone,role,full_name").eq("id", userId).single();
    expect(data).toEqual({ phone: "+254700000903", role: "complainant", full_name: "Renamed" });
  });

  it("two profiles cannot share a phone number", async () => {
    const admin = adminClient();
    const u = await admin.auth.admin.createUser({ email: `dup-${Date.now()}@test.mizani.local`, email_confirm: true });
    const { error } = await admin.from("profiles").insert({ id: u.data.user!.id, role: "complainant", phone: "+254700000903" });
    expect(error).not.toBeNull();
  });
});
