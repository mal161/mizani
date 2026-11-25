import { describe, it, expect } from "vitest";
import { staffGate } from "@/lib/auth/staff-gate";
import { signInStaff } from "../helpers/db";

const staff = { id: "u1", role: "staff" as const, phone: null };
const complainant = { id: "u2", role: "complainant" as const, phone: "+254700000001" };

describe("staffGate", () => {
  it("sends signed-out users to login", () => {
    expect(staffGate(null, null)).toBe("login");
  });
  it("sends complainants to login", () => {
    expect(staffGate(complainant, "aal2")).toBe("login");
  });
  it("requires MFA for staff at aal1", () => {
    expect(staffGate(staff, "aal1")).toBe("mfa");
  });
  it("lets staff at aal2 through", () => {
    expect(staffGate(staff, "aal2")).toBe("ok");
  });
  it("forbids staff from admin-only areas", () => {
    expect(staffGate(staff, "aal2", ["admin"])).toBe("forbidden");
    expect(staffGate({ ...staff, role: "admin" }, "aal2", ["admin"])).toBe("ok");
  });
});

describe("signInStaff test helper", () => {
  it("reaches aal2 with an enrolled TOTP factor", async () => {
    const { client } = await signInStaff("staff", `officer-${Date.now()}@test.mizani.local`);
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(data?.currentLevel).toBe("aal2");
  });
});
