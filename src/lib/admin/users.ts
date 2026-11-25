import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { STAFF_ROLES, isStaffRole, type StaffRole } from "@/lib/auth/staff-gate";
import { requireAdminActor, auditAdmin } from "./guard";

const newUserSchema = z.object({
  email: z.email().max(200),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(STAFF_ROLES as unknown as [StaffRole, ...StaffRole[]]),
  office: z.string().trim().min(2).max(60),
});

export type NewStaffUser = z.infer<typeof newUserSchema>;

/** Creates a staff/admin/commissioner account; the temporary password is returned once, never stored. */
export async function createStaffUserAs(
  actor: StaffUser,
  input: NewStaffUser,
): Promise<{ userId: string; tempPassword: string }> {
  requireAdminActor(actor);
  const u = newUserSchema.parse(input);
  const admin = createAdminClient();
  const tempPassword = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email.toLowerCase(),
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create user: ${error?.message}`);
  const userId = data.user.id;
  const { error: pErr } = await admin
    .from("profiles")
    .insert({ id: userId, role: u.role, full_name: u.fullName, office: u.office });
  if (pErr) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`could not create profile: ${pErr.message}`);
  }
  await auditAdmin(actor, "admin_create_user", "profiles", userId, { email: u.email, role: u.role, office: u.office });
  return { userId, tempPassword };
}

async function staffProfile(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("id,role,active").eq("id", userId).maybeSingle();
  if (!data || !isStaffRole(data.role)) throw new Error("not a staff account");
  return data as { id: string; role: StaffRole; active: boolean };
}

/** Deactivation bans sign-in and removes the person from automatic routing. */
export async function setUserActiveAs(actor: StaffUser, userId: string, active: boolean): Promise<void> {
  requireAdminActor(actor);
  if (userId === actor.id) throw new Error("you cannot change your own access yourself");
  const before = await staffProfile(userId);
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  if (error) throw new Error(`could not update sign-in: ${error.message}`);
  const { error: pErr } = await admin.from("profiles").update({ active }).eq("id", userId);
  if (pErr) throw new Error(`could not update profile: ${pErr.message}`);
  await auditAdmin(actor, "admin_set_active", "profiles", userId, { before: before.active, after: active });
}

export async function changeUserRoleAs(actor: StaffUser, userId: string, role: StaffRole): Promise<void> {
  requireAdminActor(actor);
  if (userId === actor.id) throw new Error("you cannot change your own role yourself");
  if (!isStaffRole(role)) throw new Error("invalid role");
  const before = await staffProfile(userId);
  const { error } = await createAdminClient().from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(`could not change role: ${error.message}`);
  await auditAdmin(actor, "admin_change_role", "profiles", userId, { before: before.role, after: role });
}

export interface StaffListRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: StaffRole;
  office: string | null;
  active: boolean;
}

/** All staff-type accounts with their sign-in email (admin page). */
export async function listStaffUsersAs(actor: StaffUser): Promise<StaffListRow[]> {
  requireAdminActor(actor);
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id,full_name,role,office,active")
    .in("role", STAFF_ROLES as unknown as string[])
    .order("full_name");
  const emails = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email);
    if (!data || data.users.length < 1000) break;
  }
  return (profiles ?? []).map((p) => ({ ...(p as Omit<StaffListRow, "email">), email: emails.get(p.id) ?? null }));
}
