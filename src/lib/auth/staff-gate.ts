import type { CurrentUser } from "./types";

export type StaffRole = "staff" | "admin" | "commissioner";
export const STAFF_ROLES: readonly StaffRole[] = ["staff", "admin", "commissioner"];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export type GateResult = "ok" | "login" | "mfa" | "forbidden";

/**
 * Decides access to staff areas. Non-staff or deactivated → login; staff below aal2 → MFA (enrol or challenge);
 * staff without one of the required roles → forbidden.
 */
export function staffGate(
  user: CurrentUser | null,
  aal: "aal1" | "aal2" | null,
  roles: readonly StaffRole[] = STAFF_ROLES,
): GateResult {
  if (!user || !isStaffRole(user.role) || user.active === false) return "login";
  if (aal !== "aal2") return "mfa";
  if (!roles.includes(user.role)) return "forbidden";
  return "ok";
}
