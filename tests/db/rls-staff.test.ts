import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  signInAs,
  signInStaff,
  makeCase,
  SUPABASE_URL,
  ANON_KEY,
  STAFF_TEST_PASSWORD,
} from "../helpers/db";

let staff: SupabaseClient;
let adminUser: SupabaseClient;
let staffNoMfa: SupabaseClient;
let complainant: SupabaseClient;
let caseId: string;

beforeAll(async () => {
  const stamp = Date.now();
  ({ client: staff } = await signInStaff("staff", `rls-staff-${stamp}@test.mizani.local`));
  ({ client: adminUser } = await signInStaff("admin", `rls-admin-${stamp}@test.mizani.local`));

  // A staff account that has only passed the password step (aal1).
  const email = `rls-nomfa-${stamp}@test.mizani.local`;
  const admin = adminClient();
  const u = await admin.auth.admin.createUser({ email, password: STAFF_TEST_PASSWORD, email_confirm: true });
  await admin.from("profiles").insert({ id: u.data.user!.id, role: "staff", office: "Nairobi" });
  staffNoMfa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await staffNoMfa.auth.signInWithPassword({ email, password: STAFF_TEST_PASSWORD });

  const c = await signInAs("complainant", "+254700001101");
  complainant = c.client;
  const created = await makeCase(c.userId);
  caseId = created.id;
  await admin.from("case_events").insert([
    { case_id: caseId, type: "filed", visibility: "parties", body: {} },
    { case_id: caseId, type: "note", visibility: "internal", body: { text: "staff only" } },
  ]);
});

describe("staff read access", () => {
  it("staff at aal2 sees cases via staff_cases, with complainant details", async () => {
    const { data, error } = await staff
      .from("staff_cases")
      .select("id,case_number,complainant_phone,stage")
      .eq("id", caseId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].complainant_phone).toBe("+254700001101");
  });

  it("staff_cases has no pin_hash column", async () => {
    const { error } = await staff.from("staff_cases").select("pin_hash").limit(1);
    expect(error).not.toBeNull();
  });

  it("staff sees internal events", async () => {
    const { data } = await staff.from("case_events").select("visibility").eq("case_id", caseId);
    expect(data!.map((e) => e.visibility).sort()).toEqual(["internal", "parties"]);
  });

  it("staff who skipped MFA sees nothing", async () => {
    const cases = await staffNoMfa.from("staff_cases").select("id").eq("id", caseId);
    expect(cases.data ?? []).toEqual([]);
    const events = await staffNoMfa.from("case_events").select("id").eq("case_id", caseId);
    expect(events.data ?? []).toEqual([]);
  });

  it("complainants see nothing in staff_cases", async () => {
    const { data } = await complainant.from("staff_cases").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("only admins read the audit log", async () => {
    const asStaff = await staff.from("audit_log").select("id").limit(1);
    expect(asStaff.data ?? []).toEqual([]);
    const asAdmin = await adminUser.from("audit_log").select("id").limit(1);
    expect(asAdmin.data).toHaveLength(1);
  });

  it("staff still cannot write directly", async () => {
    const { error } = await staff.from("case_events").insert({ case_id: caseId, type: "note", visibility: "internal" });
    expect(error).not.toBeNull();
  });
});
