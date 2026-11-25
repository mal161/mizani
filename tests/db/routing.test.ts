import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { routeCase } from "@/lib/cases/routing";
import { afterFiling } from "@/lib/cases/after-filing";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

const office = `RoutingTest-${Date.now()}`;
let officerId: string;
let complainantId: string;
let ruleId: string;

beforeAll(async () => {
  ({ userId: officerId } = await signInStaff("staff", `routing-${Date.now()}@test.mizani.local`, office));
  ({ userId: complainantId } = await signInAs("complainant", "+254700001301"));
  const { data } = await adminClient()
    .from("routing_rules")
    .insert({ position: -1000, office, officer_ids: [officerId] })
    .select("id")
    .single();
  ruleId = data!.id;
});
afterAll(async () => {
  await adminClient().from("routing_rules").delete().eq("id", ruleId);
});

describe("routeCase", () => {
  it("assigns by matching rule and records an automatic assignment event", async () => {
    const c = await makeCase(complainantId, { office });
    expect(await routeCase(c.id)).toBe(officerId);
    const admin = adminClient();
    const { data } = await admin.from("cases").select("assigned_officer_id").eq("id", c.id).single();
    expect(data!.assigned_officer_id).toBe(officerId);
    const { data: ev } = await admin.from("case_events").select("body,actor_id").eq("case_id", c.id).eq("type", "assigned");
    expect(ev).toEqual([{ body: { officer_id: officerId, auto: true }, actor_id: null }]);
  });

  it("afterFiling routes a case that has no matching rule to some active staff member", async () => {
    const c = await makeCase(complainantId);
    await afterFiling(c.id);
    const admin = adminClient();
    const { data } = await admin.from("cases").select("assigned_officer_id").eq("id", c.id).single();
    const { data: p } = await admin.from("profiles").select("role,active").eq("id", data!.assigned_officer_id).single();
    expect(["staff", "admin"]).toContain(p!.role);
    expect(p!.active).toBe(true);
  });

  it("never routes to a deactivated officer", async () => {
    await adminClient().from("profiles").update({ active: false }).eq("id", officerId);
    const c = await makeCase(complainantId, { office });
    expect(await routeCase(c.id)).not.toBe(officerId);
    await adminClient().from("profiles").update({ active: true }).eq("id", officerId);
  });
});
