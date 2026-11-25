"use server";

import { hasLocale } from "next-intl";
import { createServerClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { redirect, routing, type Locale } from "@/i18n/routing";

export type MfaState = { error?: "invalid_code" };

export async function verifyMfaAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const l = String(formData.get("locale"));
  const locale: Locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "invalid_code" };

  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return redirect({ href: "/staff/login", locale });

  // The factor must belong to the signed-in user.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.all.some((f) => f.id === factorId && f.factor_type === "totp")) return { error: "invalid_code" };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "invalid_code" };
  await logAudit({ actorId: userData.user.id, channel: "web", action: "login_mfa", entity: "profiles", entityId: userData.user.id });
  return redirect({ href: "/staff", locale });
}
