import "server-only";
import { createServerClient } from "@/lib/supabase/server";
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
    .select("id,role,phone,full_name,office")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile as CurrentUser | null;
}

/** Returns the signed-in complainant or redirects to the login page. */
export async function requireComplainant(locale: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "complainant") {
    return redirect({ href: "/login", locale });
  }
  return user;
}
