"use server";

import { requestLoginCode, verifyLoginCode } from "@/lib/auth/otp";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, isLoopback } from "@/lib/request-ip";
import { redirect, routing, type Locale } from "@/i18n/routing";
import { hasLocale } from "next-intl";

export type LoginState = {
  step: "phone" | "code";
  phone: string;
  error?: "invalid_phone" | "rate_limited" | "invalid_code";
};

function localeOf(formData: FormData): Locale {
  const l = String(formData.get("locale"));
  return hasLocale(routing.locales, l) ? l : routing.defaultLocale;
}

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const locale = localeOf(formData);
  const phone = String(formData.get("phone") ?? "");

  if (formData.get("intent") === "send") {
    const ip = await clientIp();
    const r = await requestLoginCode(phone, locale, isLoopback(ip) ? null : ip);
    return r.ok ? { step: "code", phone } : { step: "phone", phone, error: r.reason };
  }

  const r = await verifyLoginCode(phone, String(formData.get("code") ?? "").trim(), locale);
  if (!r.ok) return { step: "code", phone, error: "invalid_code" };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
  if (error) return { step: "code", phone, error: "invalid_code" };
  return redirect({ href: r.role === "advocate" ? "/advocate" : "/my/cases", locale });
}
