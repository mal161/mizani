import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scheduleHearingAs,
  rescheduleHearingAs,
  cancelHearingAs,
  recordHearingMinutesAs,
  HearingClashError,
} from "@/lib/commission/hearings";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInAdvocate, signInStaff, makeCase } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const inDays = (d: number, hour = 10) => {
  const t = new Date(Date.now() + d * 86_400_000);
  t.setUTCHours(hour - 3, 0, 0, 0); // hour in Nairobi
  return t.toISOString();
};
let officer: StaffUser;
let comm: StaffUser;
let comm2: StaffUser;
let complainant: { client: SupabaseClient; userId: string };
let adv: { advocateId: string; userId: string };
const advPhone = `+25470008${String(Date.now()).slice(-4)}`;

async function investigationCase() {
  const c = await makeCase(complainant.userId, {
    advocate_id: adv.advocateId,
    advocate_notified_at: new Date().toISOString(),
    stage: "investigation",
  });
  fake().sent.length = 0;
  return c;
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const stamp = Date.now();
  const o = await signInStaff("staff", `hear-off-${stamp}@test.mizani.local`);
  officer = { id: o.userId, role: "staff", phone: null };
  const c1 = await signInStaff("commissioner", `hear-c1-${stamp}@test.mizani.local`);
  comm = { id: c1.userId, role: "commissioner", phone: null };
  const c2 = await signInStaff("commissioner", `hear-c2-${stamp}@test.mizani.local`);
  comm2 = { id: c2.userId, role: "commissioner", phone: null };
  complainant = await signInAs("complainant", "+254700002801");
  adv = await signInAdvocate(advPhone);
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("scheduleHearingAs", () => {
  it("schedules, moves the case to hearing, tells both parties and the panel; the link stays out of SMS and events", async () => {
    const c = await investigationCase();
    const r = await scheduleHearingAs(officer, c.id, {
      startsAt: inDays(5),
      durationMinutes: 90,
      mode: "online",
      onlineLink: "https://meet.example.org/acc-hearing-123",
      panel: [comm.id],
    });
    const admin = adminClient();
    expect((await admin.from("cases").select("stage").eq("id", c.id).single()).data!.stage).toBe("hearing");
    const { data: ev } = await admin.from("case_events").select("visibility,advocate_visible,body").eq("case_id", c.id).eq("type", "hearing_scheduled").single();
    expect(ev).toMatchObject({ visibility: "parties", advocate_visible: true });
    expect(JSON.stringify(ev!.body)).not.toContain("meet.example.org");
    expect(fake().sent.map((m) => m.to).sort()).toEqual([advPhone, "+254700002801"].sort());
    expect(fake().sent.every((m) => !m.message.includes("meet.example.org"))).toBe(true);
    const { data: n } = await admin.from("notifications").select("user_id,kind").eq("case_id", c.id).eq("kind", "hearing_scheduled");
    expect(n).toEqual([{ user_id: comm.id, kind: "hearing_scheduled" }]);
    expect(r.hearingId).toBeTruthy();
  });

  it("refuses commissioners, past dates, bad panels and online hearings without an https link", async () => {
    const c = await investigationCase();
    const base = { startsAt: inDays(3), durationMinutes: 60, mode: "in_person" as const, venue: "ACC Boardroom", panel: [comm.id] };
    await expect(scheduleHearingAs(comm, c.id, base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(scheduleHearingAs(officer, c.id, { ...base, startsAt: inDays(-1) })).rejects.toThrow(/future/);
    await expect(scheduleHearingAs(officer, c.id, { ...base, panel: [] })).rejects.toThrow(/panel/);
    await expect(scheduleHearingAs(officer, c.id, { ...base, panel: [officer.id] })).rejects.toThrow(/panel/);
    await expect(scheduleHearingAs(officer, c.id, { ...base, mode: "online", venue: undefined, onlineLink: "http://insecure" })).rejects.toThrow(/https/);
  });

  it("warns about a panel member's overlapping hearing, and allows it when confirmed", async () => {
    const a = await investigationCase();
    const b = await investigationCase();
    const slot = { startsAt: inDays(9, 11), durationMinutes: 120, mode: "in_person" as const, venue: "Room 2", panel: [comm2.id] };
    await scheduleHearingAs(officer, a.id, slot);
    const clash = await scheduleHearingAs(officer, b.id, { ...slot, startsAt: inDays(9, 12) }).catch((e) => e);
    expect(clash).toBeInstanceOf(HearingClashError);
    expect((clash as HearingClashError).clashes).toEqual([a.case_number]);
    const ok = await scheduleHearingAs(officer, b.id, { ...slot, startsAt: inDays(9, 12), confirmClash: true });
    expect(ok.clashes).toEqual([a.case_number]);
  });

  it("allows only one scheduled hearing per case; cancelling frees it; rescheduling texts the parties", async () => {
    const c = await investigationCase();
    const slot = { startsAt: inDays(12), durationMinutes: 60, mode: "in_person" as const, venue: "Room 3", panel: [comm.id] };
    const { hearingId } = await scheduleHearingAs(officer, c.id, slot);
    await expect(scheduleHearingAs(officer, c.id, { ...slot, startsAt: inDays(13) })).rejects.toThrow(/already/);
    fake().sent.length = 0;
    await rescheduleHearingAs(officer, hearingId, { ...slot, startsAt: inDays(14) });
    expect(fake().sent.length).toBeGreaterThanOrEqual(1);
    await cancelHearingAs(officer, hearingId, "Advocate unwell");
    const { data } = await adminClient().from("hearings").select("status").eq("id", hearingId).single();
    expect(data!.status).toBe("cancelled");
    await scheduleHearingAs(officer, c.id, { ...slot, startsAt: inDays(15) });
  });
});

describe("recordHearingMinutesAs", () => {
  it("a panel commissioner records minutes; they stay internal; officers cannot record them", async () => {
    const c = await investigationCase();
    const { hearingId } = await scheduleHearingAs(officer, c.id, { startsAt: inDays(4), durationMinutes: 60, mode: "in_person", venue: "Room 1", panel: [comm.id] });
    await expect(recordHearingMinutesAs(officer, hearingId, "Officer minutes attempt that should fail.")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(recordHearingMinutesAs(comm2, hearingId, "Not on the panel, should fail to record.")).rejects.toThrow(/panel/);
    await recordHearingMinutesAs(comm, hearingId, "Both parties attended. Advocate conceded receipt of KES 300,000.");
    const admin = adminClient();
    expect((await admin.from("hearings").select("status,minutes").eq("id", hearingId).single()).data).toEqual({
      status: "held",
      minutes: "Both parties attended. Advocate conceded receipt of KES 300,000.",
    });
    const { data: seen } = await complainant.client.from("case_events").select("type,body").eq("case_id", c.id);
    expect(seen!.map((e) => e.type)).toContain("hearing_held");
    expect(JSON.stringify(seen)).not.toContain("conceded");
  });
});
