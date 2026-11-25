import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { fileWalkInComplaintAs } from "@/lib/cases/walk-in";
import { checkStatus } from "@/lib/cases/status-check";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs, signInStaff } from "../helpers/db";

const fake = () => getSmsProvider() as FakeSms;
let officer: StaffUser;

const complaint = {
  advocateNameGiven: "Walk-in Test Advocate",
  summary: "Advocate sold my land without consent",
  description: "I came to the Mombasa office because the advocate sold my land without my consent last year.",
  language: "sw" as const,
  consentDataProcessing: true as const,
};

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const s = await signInStaff("staff", `walkin-${Date.now()}@test.mizani.local`, "Mombasa");
  officer = { id: s.userId, role: "staff", phone: null, office: "Mombasa" };
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("walk-in intake", () => {
  it("files for a person without a phone: walk_in channel, staff as filer, office recorded, no SMS, status check works", async () => {
    const r = await fileWalkInComplaintAs(officer, { ...complaint, fullName: "Mama Zawadi" }, []);
    const { data: c } = await adminClient()
      .from("cases")
      .select("channel,filed_by,office,complainant_id")
      .eq("id", r.caseId)
      .single();
    expect(c).toMatchObject({ channel: "walk_in", filed_by: officer.id, office: "Mombasa" });
    const { data: p } = await adminClient().from("profiles").select("role,phone,full_name").eq("id", c!.complainant_id).single();
    expect(p).toEqual({ role: "complainant", phone: null, full_name: "Mama Zawadi" });
    expect(fake().sent).toHaveLength(0);
    expect(await checkStatus(r.caseNumber, r.pin, "web", "walk-in-test")).toMatchObject({ ok: true });
  });

  it("reuses the existing complainant for a known phone and texts them", async () => {
    const { userId } = await signInAs("complainant", "+254700001501");
    const r = await fileWalkInComplaintAs(officer, { ...complaint, fullName: "Known Person", phone: "0700001501" }, []);
    const { data: c } = await adminClient().from("cases").select("complainant_id").eq("id", r.caseId).single();
    expect(c!.complainant_id).toBe(userId);
    expect(fake().sent).toHaveLength(1);
    expect(fake().sent[0].message).toContain(r.caseNumber);
  });

  it("routes the case and opens the first deadline", async () => {
    const r = await fileWalkInComplaintAs(officer, { ...complaint, fullName: "Routed Person" }, []);
    const admin = adminClient();
    const { data: d } = await admin.from("case_deadlines").select("stage").eq("case_id", r.caseId);
    expect(d).toEqual([{ stage: "received" }]);
  });

  it("refuses a complainant or commissioner as the filer", async () => {
    const asComplainant = { id: officer.id, role: "complainant", phone: null } as unknown as StaffUser;
    await expect(fileWalkInComplaintAs(asComplainant, { ...complaint, fullName: "X" }, [])).rejects.toBeInstanceOf(ForbiddenError);
    const asCommissioner: StaffUser = { ...officer, role: "commissioner" };
    await expect(fileWalkInComplaintAs(asCommissioner, { ...complaint, fullName: "X" }, [])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an invalid phone number", async () => {
    await expect(
      fileWalkInComplaintAs(officer, { ...complaint, fullName: "Bad Phone", phone: "12345" }, []),
    ).rejects.toMatchObject({ reason: "invalid_input", fields: ["phone"] });
  });
});
