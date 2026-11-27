import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { getSmsProvider } from "@/lib/sms";
import { listTestSmsAs, purgeTestSms } from "@/lib/sms/test-inbox";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff } from "../helpers/db";

const stamp = Date.now();
const phone = `+2547${String(stamp).slice(-8)}`;
let admin: StaffUser;
let officer: StaffUser;
let officerClient: Awaited<ReturnType<typeof signInStaff>>["client"];
const env = {
  provider: process.env.SMS_PROVIDER,
  inbox: process.env.SMS_TEST_INBOX,
};

beforeAll(async () => {
  const a = await signInStaff(
    "admin",
    `sms-inbox-admin-${stamp}@test.mizani.local`,
  );
  admin = { id: a.userId, role: "admin", phone: null };
  const o = await signInStaff(
    "staff",
    `sms-inbox-officer-${stamp}@test.mizani.local`,
  );
  officer = { id: o.userId, role: "staff", phone: null };
  officerClient = o.client;
});
afterEach(() => {
  process.env.SMS_PROVIDER = env.provider;
  if (env.inbox === undefined) delete process.env.SMS_TEST_INBOX;
  else process.env.SMS_TEST_INBOX = env.inbox;
});

const rowsFor = async (to: string) =>
  (
    await adminClient()
      .from("test_sms_outbox")
      .select("to_phone,message,created_at")
      .eq("to_phone", to)
  ).data ?? [];

describe("test SMS inbox", () => {
  it("records what the fake provider would have sent, only when the inbox is switched on", async () => {
    process.env.SMS_PROVIDER = "fake";
    delete process.env.SMS_TEST_INBOX;
    await getSmsProvider().send(phone, `off ${stamp}`);
    expect(await rowsFor(phone)).toEqual([]);

    process.env.SMS_TEST_INBOX = "on";
    await getSmsProvider().send(
      phone,
      `Your Mizani login code is 482913 ${stamp}`,
    );
    const rows = await rowsFor(phone);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain("482913");
  });

  it("only admins can list it; officers and the public get nothing", async () => {
    process.env.SMS_PROVIDER = "fake";
    process.env.SMS_TEST_INBOX = "on";
    await getSmsProvider().send(phone, `listed ${stamp}`);
    const view = await listTestSmsAs(admin);
    expect(view.live).toBe(false);
    expect(view.rows.some((r) => r.message === `listed ${stamp}`)).toBe(true);
    await expect(listTestSmsAs(officer)).rejects.toBeInstanceOf(ForbiddenError);

    // Row-level security: no direct reads for any signed-in user, staff included.
    const { data: asOfficer } = await officerClient
      .from("test_sms_outbox")
      .select("id");
    expect(asOfficer ?? []).toEqual([]);
    const complainant = await signInAs("complainant", "+254700002901");
    const { data: asComplainant } = await complainant.client
      .from("test_sms_outbox")
      .select("id");
    expect(asComplainant ?? []).toEqual([]);
  });

  it("shows nothing once real SMS is on, and the daily purge keeps 7 days", async () => {
    process.env.SMS_PROVIDER = "fake";
    process.env.SMS_TEST_INBOX = "on";
    await getSmsProvider().send(phone, `recent ${stamp}`);
    await adminClient()
      .from("test_sms_outbox")
      .insert({
        to_phone: phone,
        message: `old ${stamp}`,
        created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      });

    await purgeTestSms(new Date());
    const messages = (await rowsFor(phone)).map((r) => r.message);
    expect(messages).toContain(`recent ${stamp}`);
    expect(messages).not.toContain(`old ${stamp}`);

    process.env.SMS_PROVIDER = "africastalking";
    const live = await listTestSmsAs(admin);
    expect(live).toEqual({ live: true, enabled: false, rows: [] });
    // With real SMS on, the purge empties the inbox entirely.
    await purgeTestSms(new Date());
    expect(await rowsFor(phone)).toEqual([]);
  });
});
