import { describe, it, expect, beforeAll } from "vitest";
import { analyticsAs, analyticsCsv } from "@/lib/analytics/analytics";
import { parsePeriod } from "@/lib/analytics/period";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { adminClient, makeCase, signInAs } from "../helpers/db";

const stamp = Date.now();
const office = `AnalyticsSvc-${stamp}`;
const admissionNo = `P.105/SVC${stamp}/2012`;
const commissioner: StaffUser = { id: "00000000-0000-0000-0000-000000000001", role: "commissioner", phone: null };
const officer: StaffUser = { id: "00000000-0000-0000-0000-000000000002", role: "staff", phone: null };

beforeAll(async () => {
  const { userId } = await signInAs("complainant", "+254700004003");
  const { data: adv, error } = await adminClient()
    .from("advocates")
    .insert({ admission_no: admissionNo, full_name: `Service Advocate ${stamp}`, phone: "+254700004103" })
    .select("id")
    .single();
  if (error) throw error;
  await makeCase(userId, { office, advocate_id: adv.id });
  await makeCase(userId, { office, advocate_id: adv.id });
});

describe("analyticsAs", () => {
  it("refuses officers", async () => {
    await expect(analyticsAs(officer, parsePeriod({}), office)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("gives commissioners the report for the office, and an advocates CSV without internal ids", async () => {
    const r = await analyticsAs(commissioner, parsePeriod({}), office);
    expect(r.overview.filed).toBe(2);
    expect(r.stages).toHaveLength(7);
    expect(r.advocates).toHaveLength(1);
    const csv = analyticsCsv(r, "advocates");
    expect(csv.startsWith(`"# Mizani analytics: advocates`)).toBe(true);
    expect(csv).toContain(admissionNo);
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
