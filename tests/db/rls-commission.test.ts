import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, signInAs, signInAdvocate, signInStaff, makeCase } from "../helpers/db";

let commissioner: { client: SupabaseClient; userId: string };
let officer: SupabaseClient;
let complainant: SupabaseClient;
let advocate: SupabaseClient;
let caseId: string;

beforeAll(async () => {
  const stamp = Date.now();
  commissioner = await signInStaff("commissioner", `rls-comm-${stamp}@test.mizani.local`);
  ({ client: officer } = await signInStaff("staff", `rls-comm-officer-${stamp}@test.mizani.local`));
  const c = await signInAs("complainant", "+254700002701");
  complainant = c.client;
  const adv = await signInAdvocate(`+25470007${String(stamp).slice(-4)}`);
  advocate = adv.client;
  caseId = (await makeCase(c.userId, { advocate_id: adv.advocateId, advocate_notified_at: new Date().toISOString(), stage: "hearing" })).id;

  const admin = adminClient();
  const { data: h, error: hErr } = await admin
    .from("hearings")
    .insert({ case_id: caseId, starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), mode: "in_person", venue: "ACC Boardroom", panel: [commissioner.userId], minutes: "secret minutes" })
    .select("id")
    .single();
  if (hErr) throw hErr;
  const { data: d, error: dErr } = await admin
    .from("decisions")
    .insert({ case_id: caseId, outcome: "dismissed", reasons: "x".repeat(60), panel: [commissioner.userId], decided_by: commissioner.userId })
    .select("id")
    .single();
  if (dErr) throw dErr;
  await admin.from("referrals").insert({ case_id: caseId, decision_id: d.id });
  expect(h.id).toBeTruthy();
});

describe("hearings, decisions and referrals access", () => {
  it("commissioners and officers can read them", async () => {
    for (const client of [commissioner.client, officer]) {
      expect((await client.from("hearings").select("id").eq("case_id", caseId)).data).toHaveLength(1);
      expect((await client.from("decisions").select("id").eq("case_id", caseId)).data).toHaveLength(1);
      expect((await client.from("referrals").select("id").eq("case_id", caseId)).data).toHaveLength(1);
    }
  });

  it("complainants and advocates read nothing from them", async () => {
    for (const client of [complainant, advocate]) {
      for (const table of ["hearings", "decisions", "referrals"]) {
        expect((await client.from(table).select("id").eq("case_id", caseId)).data ?? []).toEqual([]);
      }
    }
  });

  it("nobody writes directly", async () => {
    const r = await commissioner.client.from("decisions").insert({ case_id: caseId, outcome: "dismissed", reasons: "y".repeat(60), panel: [commissioner.userId] });
    expect(r.error).not.toBeNull();
    const h = await officer.from("hearings").insert({ case_id: caseId, starts_at: new Date().toISOString(), mode: "online", panel: [commissioner.userId] });
    expect(h.error).not.toBeNull();
  });

  it("a case has at most one scheduled hearing", async () => {
    const { error } = await adminClient()
      .from("hearings")
      .insert({ case_id: caseId, starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(), mode: "online", online_link: "https://meet.example/x", panel: [commissioner.userId] });
    expect(error).not.toBeNull();
  });

  it("a refund order needs an amount", async () => {
    const { error } = await adminClient()
      .from("decisions")
      .insert({ case_id: caseId, outcome: "refund_ordered", reasons: "z".repeat(60), panel: [commissioner.userId] });
    expect(error).not.toBeNull();
  });
});
