import { describe, it, expect, beforeEach } from "vitest";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth/otp";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const rand = () => `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeEach(() => {
  process.env.SMS_PROVIDER = "fake";
  delete process.env.OTP_TEST_CODE;
  fake().sent.length = 0;
});

function lastCode(): string {
  const msg = fake().sent.at(-1)!.message;
  return /(\d{6})/.exec(msg)![1];
}

describe("phone login codes", () => {
  it("sends a 6-digit code by SMS in the chosen language", async () => {
    const phone = rand();
    const r = await requestLoginCode(phone, "sw");
    expect(r).toEqual({ ok: true });
    expect(fake().sent).toHaveLength(1);
    expect(fake().sent[0].to).toBe(`+254${phone.slice(1)}`);
    expect(fake().sent[0].message).toMatch(/nambari/i);
  });

  it("reports sms_failed instead of throwing when the SMS provider refuses (e.g. a bad API key)", async () => {
    process.env.SMS_PROVIDER = "africastalking";
    process.env.AT_USERNAME = "sandbox";
    const realFetch = globalThis.fetch;
    const smsCalls: string[] = [];
    // Only the SMS request is faked (401, as Africa's Talking answers a wrong key); the database calls go through.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("africastalking.com")) {
        smsCalls.push(url);
        return new Response("The supplied authentication is invalid", { status: 401 });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const errors: unknown[][] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      expect(await requestLoginCode(rand(), "en")).toEqual({ ok: false, reason: "sms_failed" });
      expect(smsCalls).toHaveLength(1);
      // The failure is logged for operators, without the code itself.
      expect(errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).not.toMatch(/\b\d{6}\b/);
    } finally {
      globalThis.fetch = realFetch;
      console.error = realError;
      delete process.env.AT_USERNAME;
    }
  });

  it("rejects an invalid phone number", async () => {
    expect(await requestLoginCode("12345", "en")).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("correct code returns a token and creates a complainant profile", async () => {
    const phone = rand();
    await requestLoginCode(phone, "en");
    const r = await verifyLoginCode(phone, lastCode());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokenHash).toBeTruthy();
    const { data } = await adminClient()
      .from("profiles")
      .select("role,phone")
      .eq("phone", `+254${phone.slice(1)}`)
      .single();
    expect(data).toEqual({ role: "complainant", phone: `+254${phone.slice(1)}` });
  });

  it("a code works only once", async () => {
    const phone = rand();
    await requestLoginCode(phone, "en");
    const code = lastCode();
    expect((await verifyLoginCode(phone, code)).ok).toBe(true);
    expect(await verifyLoginCode(phone, code)).toEqual({ ok: false, reason: "invalid_code" });
  });

  it("locks after 5 wrong attempts even if the right code follows", async () => {
    const phone = rand();
    await requestLoginCode(phone, "en");
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await verifyLoginCode(phone, wrong);
    expect(await verifyLoginCode(phone, code)).toEqual({ ok: false, reason: "invalid_code" });
  });

  it("limits code requests to 3 per 10 minutes", async () => {
    const phone = rand();
    for (let i = 0; i < 3; i++) expect((await requestLoginCode(phone, "en")).ok).toBe(true);
    expect(await requestLoginCode(phone, "en")).toEqual({ ok: false, reason: "rate_limited" });
  });
});
