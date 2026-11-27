"use server";

import { hasLocale } from "next-intl";
import { startAdvocateActivation, completeAdvocateActivation } from "@/lib/advocates/activation";
import { createServerClient } from "@/lib/supabase/server";
import { clientIp, isLoopback } from "@/lib/request-ip";
import { redirect, routing, type Locale } from "@/i18n/routing";

export type ActivateState = {
  step: "start" | "verify";
  admissionNo: string;
  phone: string;
  error?: "invalid" | "rate_limited" | "sms_failed" | "already_activated" | "phone_in_use" | "invalid_phone" | "invalid_code";
};

export async function activateAction(prev: ActivateState, formData: FormData): Promise<ActivateState> {
  const l = String(formData.get("locale"));
  const locale: Locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const admissionNo = String(formData.get("admissionNo") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (formData.get("intent") === "start") {
    const ip = await clientIp();
    const r = await startAdvocateActivation(
      { admissionNo, code: String(formData.get("code") ?? ""), phone },
      locale,
      isLoopback(ip) ? null : ip,
    );
    return r.ok ? { step: "verify", admissionNo, phone } : { step: "start", admissionNo, phone, error: r.reason };
  }

  const r = await completeAdvocateActivation(phone, String(formData.get("smsCode") ?? "").trim());
  if (!r.ok) {
    return r.reason === "phone_in_use"
      ? { step: "start", admissionNo, phone, error: "phone_in_use" }
      : { step: "verify", admissionNo, phone, error: "invalid_code" };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
  if (error) return { step: "verify", admissionNo, phone, error: "invalid_code" };
  return redirect({ href: "/advocate", locale });
}
