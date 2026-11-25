"use server";

import { hasLocale } from "next-intl";
import { createServerClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/staff-gate";
import { logAudit } from "@/lib/audit";
import { redirect, routing, type Locale } from "@/i18n/routing";

export type StaffLoginState = { error?: "invalid"; email?: string };

export async function staffLoginAction(_prev: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const l = String(formData.get("locale"));
  const locale: Locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "invalid", email };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || !isStaffRole(profile.role)) {
    // Same message as a wrong password: do not reveal which accounts are staff.
    await supabase.auth.signOut();
    return { error: "invalid", email };
  }
  await logAudit({ actorId: data.user.id, channel: "web", action: "login_password", entity: "profiles", entityId: data.user.id });
  return redirect({ href: "/staff/mfa", locale });
}
