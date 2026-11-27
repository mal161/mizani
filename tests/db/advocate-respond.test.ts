import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { submitAdvocateResponse } from "@/lib/advocates/respond";
import { addDeadline } from "@/lib/cases/deadlines";
import { adminClient, signInAs, signInAdvocate, signInStaff, makeCase } from "../helpers/db";
import { makeTextPdf } from "../helpers/pdf";

let adv: { userId: string; advocateId: string };
let other: { userId: string; advocateId: string };
let complainant: { client: SupabaseClient; userId: string };
let officerId: string;
const text = "I deny the allegations. The funds were released on 2 April as the attached receipt shows.";

async function notifiedCase(dueInDays = 14) {
  const c = await makeCase(complainant.userId, {
    advocate_id: adv.advocateId,
    advocate_notified_at: new Date().toISOString(),
    assigned_officer_id: officerId,
    stage: "advocate_notified",
  });
  await addDeadline(c.id, "advocate_response", new Date(Date.now() + dueInDays * 86_400_000));
  return c;
}

beforeAll(async () => {
  const stamp = String(Date.now()).slice(-4);
  adv = await signInAdvocate(`+25470005${stamp}`);
  other = await signInAdvocate(`+25470006${stamp}`);
  complainant = await signInAs("complainant", "+254700002501");
  ({ userId: officerId } = await signInStaff("staff", `adv-respond-${Date.now()}@test.mizani.local`));
});

describe("submitAdvocateResponse", () => {
  it("stores an on-time response privately, records a text-free event, meets the deadline and alerts the officer", async () => {
    const c = await notifiedCase();
    const pdf = new File([makeTextPdf(["Receipt"])], "receipt.pdf", { type: "application/pdf" });
    expect(await submitAdvocateResponse(adv.userId, c.id, text, [pdf])).toEqual({ late: false, documentIds: expect.any(Array) });

    const admin = adminClient();
    const { data: resp } = await admin.from("advocate_responses").select("text,late,advocate_profile_id").eq("case_id", c.id);
    expect(resp).toEqual([{ text, late: false, advocate_profile_id: adv.userId }]);
    const { data: ev } = await admin.from("case_events").select("visibility,advocate_visible,body").eq("case_id", c.id).eq("type", "advocate_responded");
    expect(ev).toEqual([{ visibility: "parties", advocate_visible: true, body: { late: false, documents: 1 } }]);
    const { data: docs } = await admin.from("documents").select("visibility,uploaded_by").eq("case_id", c.id);
    expect(docs).toEqual([{ visibility: "internal", uploaded_by: adv.userId }]);
    const { data: d } = await admin.from("case_deadlines").select("met_at").eq("case_id", c.id).eq("kind", "advocate_response");
    expect(d![0].met_at).not.toBeNull();
    const { data: n } = await admin.from("notifications").select("user_id,kind").eq("case_id", c.id);
    expect(n).toEqual([{ user_id: officerId, kind: "advocate_responded" }]);

    // The complainant sees that a response arrived, never its text or files.
    expect((await complainant.client.from("advocate_responses").select("id").eq("case_id", c.id)).data ?? []).toEqual([]);
    expect((await complainant.client.from("documents").select("id").eq("case_id", c.id)).data ?? []).toEqual([]);
    const { data: seen } = await complainant.client.from("case_events").select("type,body").eq("case_id", c.id);
    expect(JSON.stringify(seen)).not.toContain("deny");
  });

  it("marks a response after the deadline as late", async () => {
    const c = await notifiedCase(-1);
    expect(await submitAdvocateResponse(adv.userId, c.id, text, [])).toEqual({ late: true, documentIds: expect.any(Array) });
  });

  it("refuses another advocate, a case not yet notified, and a too-short response", async () => {
    const c = await notifiedCase();
    await expect(submitAdvocateResponse(other.userId, c.id, text, [])).rejects.toThrow(/not your case/);
    const quiet = await makeCase(complainant.userId, { advocate_id: adv.advocateId });
    await expect(submitAdvocateResponse(adv.userId, quiet.id, text, [])).rejects.toThrow(/not your case/);
    await expect(submitAdvocateResponse(adv.userId, c.id, "Too short", [])).rejects.toMatchObject({ reason: "invalid_input" });
  });
});
