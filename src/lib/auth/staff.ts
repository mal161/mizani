import "server-only";
import { forbidden } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { redirect, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "./session";
import { staffGate, STAFF_ROLES, type StaffRole } from "./staff-gate";

export { type StaffRole, STAFF_ROLES } from "./staff-gate";

export { type StaffUser, ForbiddenError } from "./staff-types";
import { type StaffUser, ForbiddenError } from "./staff-types";

async function currentAal(): Promise<"aal1" | "aal2" | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return (data?.currentLevel as "aal1" | "aal2" | null) ?? null;
}

/** For staff pages: redirects to login / MFA as needed; responds 403 when the role is not allowed. */
export async function requireStaff(
  locale: Locale,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<StaffUser> {
  const user = await getCurrentUser();
  const gate = staffGate(user, user ? await currentAal() : null, roles);
  if (gate === "login") return redirect({ href: "/staff/login", locale });
  if (gate === "mfa") return redirect({ href: "/staff/mfa", locale });
  if (gate === "forbidden") forbidden();
  return user as StaffUser;
}

/** For server actions: same checks, but throws instead of redirecting. */
export async function assertStaff(roles: readonly StaffRole[] = STAFF_ROLES): Promise<StaffUser> {
  const user = await getCurrentUser();
  const gate = staffGate(user, user ? await currentAal() : null, roles);
  if (gate !== "ok") throw new ForbiddenError(gate);
  return user as StaffUser;
}
