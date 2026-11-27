import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createStaffUserAs, setUserActiveAs, changeUserRoleAs } from "@/lib/admin/users";
import { updateWorkflowSettingsAs } from "@/lib/admin/settings";
import { saveRoutingRuleAs, deleteRoutingRuleAs } from "@/lib/admin/routing-rules";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { ussdResponse } from "@/lib/ussd/menu";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInStaff, SUPABASE_URL, ANON_KEY } from "../helpers/db";

let adminUser: StaffUser;
let officer: StaffUser;
let originalLabels: unknown;
const stamp = Date.now();

beforeAll(async () => {
  const a = await signInStaff("admin", `admin-test-${stamp}@test.mizani.local`);
  adminUser = { id: a.userId, role: "admin", phone: null };
  const o = await signInStaff("staff", `admin-test-officer-${stamp}@test.mizani.local`);
  officer = { id: o.userId, role: "staff", phone: null };
  const { data } = await adminClient().from("settings").select("value").eq("key", "stage_labels").single();
  originalLabels = data!.value;
});
afterAll(async () => {
  await adminClient().from("settings").update({ value: originalLabels }).eq("key", "stage_labels");
});

const auditRows = async (action: string, entityId: string) =>
  (await adminClient().from("audit_log").select("action,actor_id,details").eq("action", action).eq("entity_id", entityId)).data!;

describe("admin-only guard", () => {
  it("refuses every admin function for an officer and writes nothing", async () => {
    const email = `blocked-${stamp}@test.mizani.local`;
    await expect(createStaffUserAs(officer, { email, fullName: "Blocked", role: "staff", office: "Nairobi" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserActiveAs(officer, adminUser.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeUserRoleAs(officer, officer.id, "admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWorkflowSettingsAs(officer, { conciliationEnabled: false })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveRoutingRuleAs(officer, { position: 0, officerIds: [officer.id] })).rejects.toBeInstanceOf(ForbiddenError);
    const { data } = await adminClient().from("profiles").select("id").eq("full_name", "Blocked");
    expect(data).toEqual([]);
  });
});

describe("users", () => {
  it("creates a staff account that can sign in with the temporary password, and audits it", async () => {
    const email = `new-officer-${stamp}@test.mizani.local`;
    const r = await createStaffUserAs(adminUser, { email, fullName: "New Officer", role: "staff", office: "Kisumu" });
    expect(r.tempPassword.length).toBeGreaterThanOrEqual(12);
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: r.tempPassword });
    expect(error).toBeNull();
    const { data: p } = await adminClient().from("profiles").select("role,office,full_name,active").eq("id", r.userId).single();
    expect(p).toEqual({ role: "staff", office: "Kisumu", full_name: "New Officer", active: true });
    expect(await auditRows("admin_create_user", r.userId)).toHaveLength(1);
  });

  it("a deactivated user cannot sign in and is marked inactive; reactivation restores access", async () => {
    const email = `deact-${stamp}@test.mizani.local`;
    const r = await createStaffUserAs(adminUser, { email, fullName: "Leaving Officer", role: "staff", office: "Nairobi" });
    await setUserActiveAs(adminUser, r.userId, false);
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    expect((await client.auth.signInWithPassword({ email, password: r.tempPassword })).error).not.toBeNull();
    const { data } = await adminClient().from("profiles").select("active").eq("id", r.userId).single();
    expect(data!.active).toBe(false);
    await setUserActiveAs(adminUser, r.userId, true);
    expect((await client.auth.signInWithPassword({ email, password: r.tempPassword })).error).toBeNull();
    expect(await auditRows("admin_set_active", r.userId)).toHaveLength(2);
  });

  it("an admin cannot deactivate or demote themself", async () => {
    await expect(setUserActiveAs(adminUser, adminUser.id, false)).rejects.toThrow(/yourself/);
    await expect(changeUserRoleAs(adminUser, adminUser.id, "staff")).rejects.toThrow(/yourself/);
  });

  it("changes another user's role among staff roles only", async () => {
    const r = await createStaffUserAs(adminUser, { email: `role-${stamp}@test.mizani.local`, fullName: "Role Change", role: "staff", office: "Nairobi" });
    await changeUserRoleAs(adminUser, r.userId, "commissioner");
    const { data } = await adminClient().from("profiles").select("role").eq("id", r.userId).single();
    expect(data!.role).toBe("commissioner");
    await expect(changeUserRoleAs(adminUser, r.userId, "complainant" as never)).rejects.toThrow();
  });
});

describe("workflow settings", () => {
  it("renaming a stage in Swahili changes the USSD reply", async () => {
    await updateWorkflowSettingsAs(adminUser, { stageLabels: { en: {}, sw: { hearing: "Kikao cha Tume" } } });
    const cfg = await loadWorkflowConfig();
    const ok = async () => ({ ok: true as const, stage: "hearing" as const, stageSince: "", actions: { infoRequested: false, hearingScheduled: false, decisionIssued: false } });
    expect(await ussdResponse("2*2026000123*123456", ok, "+254700000000", cfg.stageLabels)).toContain("Kikao cha Tume");
    const rows = await auditRows("admin_update_settings", "stage_labels");
    expect(rows.at(-1)!.details).toHaveProperty("before");
    expect(rows.at(-1)!.details).toHaveProperty("after");
  });

  it("rejects an SLA of 0 days and an empty category list", async () => {
    await expect(updateWorkflowSettingsAs(adminUser, { slaDays: { investigation: 0 } })).rejects.toThrow();
    await expect(updateWorkflowSettingsAs(adminUser, { categories: [] })).rejects.toThrow();
  });
});

describe("routing rules", () => {
  it("saves and deletes a rule, auditing both", async () => {
    const id = await saveRoutingRuleAs(adminUser, { position: 99, category: "delay", officerIds: [officer.id] });
    const { data } = await adminClient().from("routing_rules").select("category,officer_ids").eq("id", id).single();
    expect(data).toEqual({ category: "delay", officer_ids: [officer.id] });
    await deleteRoutingRuleAs(adminUser, id);
    expect((await adminClient().from("routing_rules").select("id").eq("id", id)).data).toEqual([]);
    expect(await auditRows("admin_save_routing_rule", id)).toHaveLength(1);
    expect(await auditRows("admin_delete_routing_rule", id)).toHaveLength(1);
  });

  it("rejects a rule whose pool includes a non-officer", async () => {
    await expect(saveRoutingRuleAs(adminUser, { position: 1, officerIds: [crypto.randomUUID()] })).rejects.toThrow();
  });
});
