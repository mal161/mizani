import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhone } from "@/lib/phone";
import { generatePin, hashPin, verifyPin } from "@/lib/pin";
import { getSmsProvider } from "@/lib/sms";
import { logAudit } from "@/lib/audit";
import type { Locale } from "@/i18n/routing";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_ATTEMPTS = 5;

const codeSms: Record<Locale, (code: string) => string> = {
  en: (c) => `Your Mizani login code is ${c}. It expires in 10 minutes. Do not share it.`,
  sw: (c) => `Nambari yako ya kuingia Mizani ni ${c}. Inaisha baada ya dakika 10. Usimpe mtu.`,
};

/** Synthetic email used to back phone-only accounts in Supabase Auth. */
export function phoneEmail(e164: string): string {
  return `${e164.replace(/\D/g, "")}@phone.mizani.local`;
}

export type RequestResult = { ok: true } | { ok: false; reason: "invalid_phone" | "rate_limited" };

export async function requestLoginCode(rawPhone: string, locale: Locale): Promise<RequestResult> {
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  const admin = createAdminClient();

  const since = new Date(Date.now() - CODE_TTL_MS).toISOString();
  const { count } = await admin
    .from("login_codes")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_REQUESTS_PER_WINDOW) return { ok: false, reason: "rate_limited" };

  // Fixed code only when SMS is faked (local dev / e2e); never with a real provider.
  const testCode = process.env.SMS_PROVIDER !== "africastalking" ? process.env.OTP_TEST_CODE : undefined;
  const code = testCode ?? generatePin();
  const { error } = await admin.from("login_codes").insert({
    phone,
    code_hash: await hashPin(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`could not store login code: ${error.message}`);
  await getSmsProvider().send(phone, codeSms[locale](code));
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; email: string; tokenHash: string; userId: string }
  | { ok: false; reason: "invalid_phone" | "invalid_code" };

export async function verifyLoginCode(
  rawPhone: string,
  code: string,
  locale: Locale = "en",
): Promise<VerifyResult> {
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("login_codes")
    .select("id,code_hash,attempts")
    .eq("phone", phone)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "invalid_code" };

  if (!/^\d{6}$/.test(code) || !(await verifyPin(code, row.code_hash))) {
    await admin.from("login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { ok: false, reason: "invalid_code" };
  }
  // Single use: only succeeds if still unused (guards concurrent submits).
  const { data: claimed } = await admin
    .from("login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return { ok: false, reason: "invalid_code" };

  const email = phoneEmail(phone);
  const userId = await ensureComplainant(email, phone, locale);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) {
    throw new Error(`could not create session link: ${error?.message}`);
  }
  await logAudit({ actorId: userId, channel: "web", action: "login", entity: "profiles", entityId: userId });
  return { ok: true, email, tokenHash: link.properties.hashed_token, userId };
}

async function ensureComplainant(email: string, phone: string, locale: Locale): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing.id;

  const created = await admin.auth.admin.createUser({
    email,
    phone,
    email_confirm: true,
    phone_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`could not create user: ${created.error?.message}`);
  }
  const id = created.data.user.id;
  const { error } = await admin
    .from("profiles")
    .insert({ id, role: "complainant", phone, preferred_locale: locale });
  if (error) throw new Error(`could not create profile: ${error.message}`);
  return id;
}
