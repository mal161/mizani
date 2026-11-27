import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signInAs, signInAdvocate, signInStaff, makeCase } from "../helpers/db";

let officer: SupabaseClient;
let commissioner: SupabaseClient;
let complainant: SupabaseClient;
let advocate: SupabaseClient;
let documentId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const admin = adminClient();
  ({ client: officer } = await signInStaff("staff", `ocr-rls-staff-${stamp}@test.mizani.local`));
  ({ client: commissioner } = await signInStaff("commissioner", `ocr-rls-comm-${stamp}@test.mizani.local`));
  const c = await signInAs("complainant", "+254700008101");
  complainant = c.client;
  const adv = await signInAdvocate(`+25470008${String(stamp).slice(-4)}`);
  advocate = adv.client;
  const kase = await makeCase(c.userId, { advocate_id: adv.advocateId });
  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      case_id: kase.id,
      storage_path: `${kase.id}/ocr-rls-${stamp}.png`,
      file_name: "scan.png",
      mime: "image/png",
      size_bytes: 10,
      uploaded_by: c.userId,
      visibility: "parties",
      shared_with_advocate: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  documentId = doc.id as string;
  const { error: tErr } = await admin
    .from("document_texts")
    .insert({ document_id: documentId, status: "done", text: "secret words", confidence: 88.5, page_count: 1, engine: "fake", attempts: 1 });
  if (tErr) throw tErr;
});

describe("document_texts", () => {
  it("is readable by officers and commissioners", async () => {
    for (const client of [officer, commissioner]) {
      const { data, error } = await client.from("document_texts").select("text").eq("document_id", documentId);
      expect(error).toBeNull();
      expect(data).toEqual([{ text: "secret words" }]);
    }
  });

  it("is invisible to the complainant and the advocate of the case", async () => {
    for (const client of [complainant, advocate]) {
      const { data } = await client.from("document_texts").select("text").eq("document_id", documentId);
      expect(data ?? []).toEqual([]);
    }
  });

  it("cannot be written by staff directly", async () => {
    await officer.from("document_texts").update({ text: "changed" }).eq("document_id", documentId);
    const { data } = await adminClient().from("document_texts").select("text").eq("document_id", documentId).single();
    expect(data?.text).toBe("secret words");
    const ins = await officer.from("document_texts").insert({ document_id: crypto.randomUUID(), status: "pending" });
    expect(ins.error).not.toBeNull();
  });

  it("audits changes without keeping the text", async () => {
    const admin = adminClient();
    await admin.from("document_texts").update({ status: "failed", error: "engine_error" }).eq("document_id", documentId);
    const { data: rows } = await admin
      .from("audit_log")
      .select("action,details")
      .eq("entity", "document_texts")
      .eq("entity_id", documentId)
      .order("id", { ascending: false })
      .limit(1);
    expect(rows?.[0]?.action).toBe("update");
    expect(rows?.[0]?.details).toMatchObject({ new: { status: "failed" }, old: { status: "done" } });
    expect(JSON.stringify(rows)).not.toContain("secret words");
  });

  it("is removed with its document", async () => {
    const admin = adminClient();
    await admin.from("documents").delete().eq("id", documentId);
    const { data } = await admin.from("document_texts").select("document_id").eq("document_id", documentId);
    expect(data).toEqual([]);
  });
});
