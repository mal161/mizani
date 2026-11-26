import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import type { CurrentUser } from "./types";

export type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,phone,full_name,office,active")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile as CurrentUser | null;
}

/** Returns the signed-in, active advocate with their roll entry id, or redirects to the login page. */
export async function requireAdvocate(locale: Locale): Promise<CurrentUser & { advocateId: string }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "advocate" || user.active === false) {
    return redirect({ href: "/login", locale });
  }
  // profile_id is not a public column of the roll; look it up server-side after the user is verified.
  const { data } = await createAdminClient().from("advocates").select("id").eq("profile_id", user.id).maybeSingle();
  if (!data) return redirect({ href: "/login", locale });
  return { ...user, advocateId: data.id as string };
}

/** Returns the signed-in complainant or redirects to the login page. */
export async function requireComplainant(locale: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "complainant") {
    return redirect({ href: "/login", locale });
  }
  return user;
}
