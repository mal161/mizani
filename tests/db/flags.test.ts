import { describe, it, expect, beforeAll } from "vitest";
import { caseFlags } from "@/lib/cases/flags";
import { adminClient, signInAs, makeCase } from "../helpers/db";

let complainantA: string;
let complainantB: string;
let complainantC: string;
let advocateId: string;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeAll(async () => {
  ({ userId: complainantA } = await signInAs("complainant", "+254700001901"));
  ({ userId: complainantB } = await signInAs("complainant", "+254700001902"));
  ({ userId: complainantC } = await signInAs("complainant", "+254700001903"));
  // A fresh synthetic roll entry so counts are isolated from other tests.
  const { data } = await adminClient()
    .from("advocates")
    .insert({ admission_no: `P.105/FLAG/${Date.now()}`, full_name: "Flag Test Advocate" })
    .select("id")
    .single();
  advocateId = data!.id;
});

describe("caseFlags", () => {
  it("flags another case by the same complainant against the same advocate within 90 days", async () => {
    const first = await makeCase(complainantA, { advocate_id: advocateId, created_at: daysAgo(10) });
    const second = await makeCase(complainantA, { advocate_id: advocateId });
    const f = await caseFlags(second.id);
    expect(f.possible_duplicates.map((d) => d.case_number)).toEqual([first.case_number]);
  });

  it("does not flag a case older than 90 days", async () => {
    await makeCase(complainantB, { advocate_id: advocateId, created_at: daysAgo(120) });
    const recent = await makeCase(complainantB, { advocate_id: advocateId });
    expect((await caseFlags(recent.id)).possible_duplicates).toEqual([]);
  });

  it("matches unrostered advocates by the name as given, case-insensitively", async () => {
    const name = `Unlisted Lawyer ${Date.now()}`;
    const a = await makeCase(complainantC, { advocate_name_given: name });
    const b = await makeCase(complainantC, { advocate_name_given: name.toUpperCase() });
    expect((await caseFlags(b.id)).possible_duplicates.map((d) => d.case_number)).toEqual([a.case_number]);
    expect((await caseFlags(b.id)).advocate_history).toBeNull();
  });

  it("counts every complaint against a roll advocate", async () => {
    const c = await makeCase(complainantC, { advocate_id: advocateId, stage: "closed" });
    const h = (await caseFlags(c.id)).advocate_history!;
    expect(h.total).toBe(5);
    expect(h.closed).toBe(1);
    expect(h.open).toBe(4);
    expect(h.last_12_months).toBe(5);
  });
});
