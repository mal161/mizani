import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signInAs, makeCase } from "../helpers/db";

let a: { client: SupabaseClient; userId: string };
let b: { client: SupabaseClient; userId: string };
let caseA: { id: string; case_number: string };
let caseB: { id: string; case_number: string };

beforeAll(async () => {
  a = await signInAs("complainant", "+254700000201");
  b = await signInAs("complainant", "+254700000202");
  caseA = await makeCase(a.userId);
  caseB = await makeCase(b.userId);
  const admin = adminClient();
  await admin.from("case_events").insert([
    { case_id: caseA.id, type: "filed", visibility: "parties", body: {} },
    { case_id: caseA.id, type: "note", visibility: "internal", body: { text: "secret" } },
  ]);
});

describe("complainant row-level security", () => {
  it("cannot see another complainant's case", async () => {
    const { data } = await a.client.from("my_cases").select("id").eq("id", caseB.id);
    expect(data).toEqual([]);
    const direct = await a.client.from("cases").select("id").eq("id", caseB.id);
    expect(direct.data ?? []).toEqual([]);
  });

  it("sees own case via my_cases", async () => {
    const { data } = await a.client
      .from("my_cases")
      .select("case_number")
      .eq("id", caseA.id);
    expect(data).toEqual([{ case_number: caseA.case_number }]);
  });

  it("sees parties events but not internal events", async () => {
    const { data } = await a.client
      .from("case_events")
      .select("type,visibility")
      .eq("case_id", caseA.id);
    expect(data!.map((e) => e.visibility)).toEqual(["parties"]);
  });

  it("cannot read pin_hash", async () => {
    const view = await a.client.from("my_cases").select("pin_hash").eq("id", caseA.id);
    expect(view.error).not.toBeNull();
    const table = await a.client.from("cases").select("pin_hash").eq("id", caseA.id);
    expect(table.data ?? []).toEqual([]);
  });

  it("cannot insert a case on behalf of someone else", async () => {
    const { error } = await a.client.from("cases").insert({
      case_number: "ACC/1999/000001",
      complainant_id: b.userId,
      filed_by: a.userId,
      advocate_name_given: "X",
      summary: "summary text",
      description: "description that is long enough",
      language: "en",
      channel: "online",
      pin_hash: "x",
    });
    expect(error).not.toBeNull();
  });

  it("cannot read the audit log", async () => {
    const { data } = await a.client.from("audit_log").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });
});
