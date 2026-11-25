import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";

/** Synthetic email used to back phone-only accounts in Supabase Auth. */
export function phoneEmail(e164: string): string {
  return `${e164.replace(/\D/g, "")}@phone.mizani.local`;
}

/**
 * Returns the complainant profile id for a normalised phone, creating the auth user and profile if needed.
 * Safe under concurrent calls. Refuses phones that belong to staff accounts.
 */
export async function ensureComplainantForPhone(phone: string, locale: Locale, fullName?: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id,role,full_name").eq("phone", phone).maybeSingle();
  if (existing) {
    if (existing.role !== "complainant") throw new Error("phone belongs to a non-complainant account");
    if (fullName && !existing.full_name) await admin.from("profiles").update({ full_name: fullName }).eq("id", existing.id);
    return existing.id;
  }

  const email = phoneEmail(phone);
  let id: string;
  const created = await admin.auth.admin.createUser({ email, phone, email_confirm: true, phone_confirm: true });
  if (created.data.user) {
    id = created.data.user.id;
  } else {
    const { data: existingId } = await admin.rpc("auth_user_id_by_email", { p_email: email });
    if (!existingId) throw new Error(`could not create user: ${created.error?.message}`);
    id = existingId as string;
  }
  const { error } = await admin
    .from("profiles")
    .upsert(
      { id, role: "complainant", phone, preferred_locale: locale, full_name: fullName ?? null },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) {
    const { data: again } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (again) return again.id;
    throw new Error(`could not create profile: ${error.message}`);
  }
  return id;
}

/** Creates a complainant with no phone (walk-in). They track the case with case number + PIN. */
export async function createWalkInComplainant(fullName: string, locale: Locale): Promise<string> {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email: `walkin-${randomUUID()}@walkin.mizani.local`,
    email_confirm: true,
  });
  if (!created.data.user) throw new Error(`could not create walk-in user: ${created.error?.message}`);
  const id = created.data.user.id;
  const { error } = await admin
    .from("profiles")
    .insert({ id, role: "complainant", phone: null, full_name: fullName, preferred_locale: locale });
  if (error) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(`could not create walk-in profile: ${error.message}`);
  }
  return id;
}
