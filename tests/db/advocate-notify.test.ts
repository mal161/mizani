import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { notifyAdvocateAs } from "@/lib/advocates/notify";
import { linkAdvocateAs, setDocumentSharedAs, changeStageAs } from "@/lib/cases/actions";
import { startAdvocateActivation } from "@/lib/advocates/activation";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
const rnd = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
const today = () => new Date().toISOString().slice(0, 10);
let officer: StaffUser;
let complainantId: string;

async function rollAdvocate(phone: string | null = `+2547${rnd().slice(0, 8)}`) {
  const admissionNo = `P.105/NOT${rnd()}/2019`;
  const { data } = await adminClient()
    .from("advocates")
    .insert({ admission_no: admissionNo, full_name: `Notify Test ${rnd().slice(0, 4)}`, phone })
    .select("id")
    .single();
  return { advocateId: data!.id as string, admissionNo, phone };
}

async function docRow(caseId: string, name: string) {
  const { data } = await adminClient()
    .from("documents")
    .insert({ case_id: caseId, storage_path: `${caseId}/${crypto.randomUUID()}-${name}`, file_name: name, mime: "application/pdf", size_bytes: 1, visibility: "parties" })
    .select("id")
    .single();
  return data!.id as string;
}

async function screeningCase(advocateId: string | null) {
  const c = await makeCase(complainantId, { advocate_id: advocateId });
  await changeStageAs(officer, c.id, "received", "screening");
  fake().sent.length = 0;
  return c;
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const s = await signInStaff("staff", `notify-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700002401"));
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("notifyAdvocateAs", () => {
  it("serves the advocate: stage, deadline, sharing, SMS to both sides, audit", async () => {
    const adv = await rollAdvocate();
    const c = await screeningCase(adv.advocateId);
    const share = await docRow(c.id, "receipt.pdf");
    const keep = await docRow(c.id, "medical.pdf");
    const r = await notifyAdvocateAs(officer, c.id, { servedOn: today(), method: "hand", shareDocumentIds: [share] });
    expect(r.activationCode).toMatch(/^[A-Z2-9]{8}$/);

    const admin = adminClient();
    const { data: row } = await admin.from("cases").select("stage,advocate_notified_at,advocate_served_on,advocate_service_method").eq("id", c.id).single();
    expect(row).toMatchObject({ stage: "advocate_notified", advocate_served_on: today(), advocate_service_method: "hand" });
    expect(row!.advocate_notified_at).not.toBeNull();

    const { data: d } = await admin.from("case_deadlines").select("due_at").eq("case_id", c.id).eq("kind", "advocate_response").is("met_at", null);
    expect(d).toHaveLength(1);
    const days = (new Date(d![0].due_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15.1);

    const { data: docs } = await admin.from("documents").select("id,shared_with_advocate").eq("case_id", c.id);
    expect(docs!.find((x) => x.id === share)!.shared_with_advocate).toBe(true);
    expect(docs!.find((x) => x.id === keep)!.shared_with_advocate).toBe(false);

    const toAdvocate = fake().sent.find((m) => m.to === adv.phone)!;
    expect(toAdvocate.message).toContain(c.case_number);
    expect(toAdvocate.message).not.toContain("+254700002401");
    expect(fake().sent.some((m) => m.to === "+254700002401")).toBe(true);

    const { data: ev } = await admin.from("case_events").select("type,advocate_visible").eq("case_id", c.id).in("type", ["advocate_notified", "stage_changed"]);
    expect(ev!.find((e) => e.type === "advocate_notified")!.advocate_visible).toBe(true);
    const { data: audit } = await admin.from("audit_log").select("actor_id").eq("entity_id", c.id).eq("action", "notify_advocate");
    expect(audit).toEqual([{ actor_id: officer.id }]);
  });

  it("re-notifying retires the earlier code and keeps one open response deadline", async () => {
    const adv = await rollAdvocate();
    const c = await screeningCase(adv.advocateId);
    const first = await notifyAdvocateAs(officer, c.id, { servedOn: today(), method: "post", shareDocumentIds: [] });
    await notifyAdvocateAs(officer, c.id, { servedOn: today(), method: "courier", shareDocumentIds: [] });
    expect(await startAdvocateActivation({ admissionNo: adv.admissionNo, code: first.activationCode, phone: `07${rnd()}` }, "en")).toEqual({ ok: false, reason: "invalid" });
    const { data: d } = await adminClient().from("case_deadlines").select("id").eq("case_id", c.id).eq("kind", "advocate_response").is("met_at", null);
    expect(d).toHaveLength(1);
  });

  it("refuses: no roll advocate linked, a future service date, the wrong stage, a non-officer", async () => {
    const unlinked = await screeningCase(null);
    await expect(notifyAdvocateAs(officer, unlinked.id, { servedOn: today(), method: "hand", shareDocumentIds: [] })).rejects.toThrow(/roll/);
    const adv = await rollAdvocate();
    const c = await screeningCase(adv.advocateId);
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await expect(notifyAdvocateAs(officer, c.id, { servedOn: tomorrow, method: "hand", shareDocumentIds: [] })).rejects.toThrow(/future/);
    const fresh = await makeCase(complainantId, { advocate_id: adv.advocateId });
    await expect(notifyAdvocateAs(officer, fresh.id, { servedOn: today(), method: "hand", shareDocumentIds: [] })).rejects.toThrow(/stage/);
    const commissioner: StaffUser = { ...officer, role: "commissioner" };
    await expect(notifyAdvocateAs(commissioner, c.id, { servedOn: today(), method: "hand", shareDocumentIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("linking and sharing", () => {
  it("links a roll advocate to a case and shares only parties documents", async () => {
    const adv = await rollAdvocate(null);
    const c = await screeningCase(null);
    await linkAdvocateAs(officer, c.id, adv.advocateId);
    const admin = adminClient();
    expect((await admin.from("cases").select("advocate_id").eq("id", c.id).single()).data!.advocate_id).toBe(adv.advocateId);
    const doc = await docRow(c.id, "x.pdf");
    await setDocumentSharedAs(officer, doc, true);
    expect((await admin.from("documents").select("shared_with_advocate").eq("id", doc).single()).data!.shared_with_advocate).toBe(true);
    await admin.from("documents").update({ visibility: "internal" }).eq("id", doc);
    await expect(setDocumentSharedAs(officer, doc, true)).rejects.toThrow(/internal/);
  });
});
