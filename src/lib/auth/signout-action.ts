"use server";

import { hasLocale } from "next-intl";
import { createServerClient } from "@/lib/supabase/server";
import { redirect, routing, type Locale } from "@/i18n/routing";

export async function signOutAction(formData: FormData): Promise<void> {
  const l = String(formData.get("locale"));
  const locale: Locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const to = formData.get("to") === "staff" ? "/staff/login" : "/login";
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect({ href: to, locale });
}
