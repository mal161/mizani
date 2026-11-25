import { describe, it, expect, beforeAll } from "vitest";
import { openInfoRequest, respondToInfoRequest } from "@/lib/cases/respond";
import { requestInfoAs } from "@/lib/cases/actions";
import type { StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let officer: StaffUser;
let complainantId: string;
let otherId: string;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const s = await signInStaff("staff", `respond-${Date.now()}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  ({ userId: complainantId } = await signInAs("complainant", "+254700001601"));
  ({ userId: otherId } = await signInAs("complainant", "+254700001602"));
});

async function caseWithRequest() {
  const c = await makeCase(complainantId, { assigned_officer_id: officer.id });
  await requestInfoAs(officer, c.id, "Please upload the receipt for the deposit.", 7);
  return c;
}

describe("information requests", () => {
  it("openInfoRequest returns the latest unanswered request", async () => {
    const c = await caseWithRequest();
    const r = await openInfoRequest(c.id);
    expect(r?.message).toBe("Please upload the receipt for the deposit.");
    expect(await openInfoRequest((await makeCase(complainantId)).id)).toBeNull();
  });

  it("an answer records the event and documents, meets the deadline and alerts the officer", async () => {
    const c = await caseWithRequest();
    const pdf = new File([new Uint8Array(512)], "receipt.pdf", { type: "application/pdf" });
    await respondToInfoRequest(c.id, complainantId, "Receipt attached. I paid KES 50,000 on 3 March.", [pdf]);

    const admin = adminClient();
    const { data: ev } = await admin.from("case_events").select("visibility,body").eq("case_id", c.id).eq("type", "info_provided");
    expect(ev).toEqual([{ visibility: "parties", body: { text: "Receipt attached. I paid KES 50,000 on 3 March.", documents: 1 } }]);
    const { data: docs } = await admin.from("documents").select("file_name,uploaded_by").eq("case_id", c.id);
    expect(docs).toEqual([{ file_name: "receipt.pdf", uploaded_by: complainantId }]);
    const { data: d } = await admin.from("case_deadlines").select("met_at").eq("case_id", c.id).eq("kind", "info_request");
    expect(d![0].met_at).not.toBeNull();
    const { data: n } = await admin.from("notifications").select("user_id,kind").eq("case_id", c.id);
    expect(n).toEqual([{ user_id: officer.id, kind: "info_provided" }]);
    expect(await openInfoRequest(c.id)).toBeNull();
  });

  it("another complainant cannot answer", async () => {
    const c = await caseWithRequest();
    await expect(respondToInfoRequest(c.id, otherId, "Not my case but answering", [])).rejects.toThrow();
  });

  it("cannot answer when nothing was requested", async () => {
    const c = await makeCase(complainantId);
    await expect(respondToInfoRequest(c.id, complainantId, "Unprompted answer", [])).rejects.toThrow();
  });
});
