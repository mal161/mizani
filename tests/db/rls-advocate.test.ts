import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signInAs, signInAdvocate, makeCase } from "../helpers/db";

let advA: { client: SupabaseClient; userId: string; advocateId: string };
let advB: { client: SupabaseClient; userId: string; advocateId: string };
let complainant: SupabaseClient;
let notifiedCase: string;
let unnotifiedCase: string;
let caseOfB: string;
let sharedDoc: string;
let unsharedDoc: string;

async function doc(caseId: string, name: string, shared: boolean, uploadedBy?: string) {
  const { data, error } = await adminClient()
    .from("documents")
    .insert({
      case_id: caseId,
      storage_path: `${caseId}/${crypto.randomUUID()}-${name}`,
      file_name: name,
      mime: "application/pdf",
      size_bytes: 10,
      visibility: uploadedBy ? "internal" : "parties",
      shared_with_advocate: shared,
      uploaded_by: uploadedBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  const stamp = String(Date.now()).slice(-4);
  advA = await signInAdvocate(`+25470003${stamp}`);
  advB = await signInAdvocate(`+25470004${stamp}`);
  const c = await signInAs("complainant", "+254700002201");
  complainant = c.client;
  const admin = adminClient();
  await admin.from("profiles").update({ full_name: "Neema Wairimu" }).eq("id", c.userId);

  notifiedCase = (await makeCase(c.userId, { advocate_id: advA.advocateId, advocate_notified_at: new Date().toISOString() })).id;
  unnotifiedCase = (await makeCase(c.userId, { advocate_id: advA.advocateId })).id;
  caseOfB = (await makeCase(c.userId, { advocate_id: advB.advocateId, advocate_notified_at: new Date().toISOString() })).id;

  await admin.from("case_events").insert([
    { case_id: notifiedCase, type: "advocate_notified", visibility: "parties", advocate_visible: true, body: {} },
    { case_id: notifiedCase, type: "note", visibility: "internal", advocate_visible: false, body: { text: "internal" } },
    { case_id: notifiedCase, type: "info_requested", visibility: "parties", advocate_visible: false, body: { message: "to complainant" } },
  ]);
  sharedDoc = await doc(notifiedCase, "shared.pdf", true);
  unsharedDoc = await doc(notifiedCase, "unshared.pdf", false);
  await doc(notifiedCase, "own.pdf", false, advA.userId);
  await admin.from("ai_outputs").insert({ case_id: notifiedCase, kind: "triage", provider: "fake", model: "fake-1", status: "ok", output: {} });
  await admin.from("advocate_responses").insert([
    { case_id: notifiedCase, advocate_profile_id: advA.userId, text: "My response to the allegations.", late: false },
    { case_id: caseOfB, advocate_profile_id: advB.userId, text: "B's response.", late: false },
  ]);
});

describe("advocate read access", () => {
  it("sees a notified case with the complainant's name but no phone column", async () => {
    const { data, error } = await advA.client.from("advocate_cases").select("id,complainant_name,summary").eq("id", notifiedCase);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: notifiedCase, complainant_name: "Neema Wairimu", summary: expect.any(String) }]);
    const phone = await advA.client.from("advocate_cases").select("complainant_phone").limit(1);
    expect(phone.error).not.toBeNull();
  });

  it("does not see a case before notification, or another advocate's case", async () => {
    const { data } = await advA.client.from("advocate_cases").select("id").in("id", [unnotifiedCase, caseOfB]);
    expect(data).toEqual([]);
  });

  it("sees only advocate-visible events", async () => {
    const { data } = await advA.client.from("case_events").select("type").eq("case_id", notifiedCase);
    expect(data!.map((e) => e.type)).toEqual(["advocate_notified"]);
  });

  it("sees shared documents and own uploads only", async () => {
    const { data } = await advA.client.from("documents").select("id,file_name").eq("case_id", notifiedCase);
    expect(data!.map((d) => d.file_name).sort()).toEqual(["own.pdf", "shared.pdf"]);
    expect(data!.map((d) => d.id)).toContain(sharedDoc);
    expect(data!.map((d) => d.id)).not.toContain(unsharedDoc);
  });

  it("cannot read AI output, staff views, activations, or other advocates' responses", async () => {
    expect((await advA.client.from("ai_outputs").select("id").eq("case_id", notifiedCase)).data ?? []).toEqual([]);
    expect((await advA.client.from("staff_cases").select("id").limit(1)).data ?? []).toEqual([]);
    expect((await advA.client.from("advocate_activations").select("id").limit(1)).data ?? []).toEqual([]);
    const { data } = await advA.client.from("advocate_responses").select("text");
    expect(data!.map((r) => r.text)).toEqual(["My response to the allegations."]);
  });

  it("the complainant cannot read advocate responses or the advocate's documents", async () => {
    expect((await complainant.from("advocate_responses").select("id")).data ?? []).toEqual([]);
    const { data } = await complainant.from("documents").select("file_name").eq("case_id", notifiedCase);
    expect(data!.map((d) => d.file_name)).not.toContain("own.pdf");
  });

  it("cannot write anything directly", async () => {
    const r = await advA.client.from("advocate_responses").insert({ case_id: notifiedCase, advocate_profile_id: advA.userId, text: "direct", late: false });
    expect(r.error).not.toBeNull();
    const e = await advA.client.from("case_events").insert({ case_id: notifiedCase, type: "x", visibility: "parties", body: {} });
    expect(e.error).not.toBeNull();
  });
});
