import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhone } from "@/lib/phone";
import { generatePin, hashPin, verifyPin } from "@/lib/pin";
import { getSmsProvider } from "@/lib/sms";
import { logAudit } from "@/lib/audit";
import type { Locale } from "@/i18n/routing";

const CODE_TTL_MS = 10 * 60 * 1000;

const codeSms: Record<Locale, (code: string) => string> = {
  en: (c) => `Your Mizani login code is ${c}. It expires in 10 minutes. Do not share it.`,
  sw: (c) => `Nambari yako ya kuingia Mizani ni ${c}. Inaisha baada ya dakika 10. Usimpe mtu.`,
};

/** Synthetic email used to back phone-only accounts in Supabase Auth. */
export function phoneEmail(e164: string): string {
  return `${e164.replace(/\D/g, "")}@phone.mizani.local`;
}

export type RequestResult = { ok: true } | { ok: false; reason: "invalid_phone" | "rate_limited" };

/** A fixed login code is honoured only for local development/tests with faked SMS — never on a deployment. */
function testCodeOverride(): string | undefined {
  const local =
    process.env.SMS_PROVIDER !== "africastalking" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL;
  return local ? process.env.OTP_TEST_CODE : undefined;
}

/**
 * Issues and texts a login code. Limits (enforced atomically in the database): 3 per phone per
 * 10 minutes, 8 per phone per day, 10 per caller (IP) per hour.
 */
export async function requestLoginCode(
  rawPhone: string,
  locale: Locale,
  caller: string | null = null,
): Promise<RequestResult> {
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };

  const code = testCodeOverride() ?? generatePin();
  const { data: issued, error } = await createAdminClient().rpc("issue_login_code", {
    p_phone: phone,
    p_code_hash: await hashPin(code),
    p_caller: caller,
    p_ttl_seconds: CODE_TTL_MS / 1000,
  });
  if (error) throw new Error(`could not store login code: ${error.message}`);
  if (!issued) return { ok: false, reason: "rate_limited" };
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

  // Consume an attempt atomically *before* checking, so parallel guesses cannot exceed the cap.
  const { data: claimedRows, error: claimErr } = await admin.rpc("claim_login_attempt", { p_phone: phone });
  if (claimErr) throw new Error(`could not check login code: ${claimErr.message}`);
  const row = (claimedRows as { id: string; code_hash: string }[] | null)?.[0];
  if (!row) return { ok: false, reason: "invalid_code" };
  if (!/^\d{6}$/.test(code) || !(await verifyPin(code, row.code_hash))) {
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

  // Reuse an existing auth user for this phone's email (earlier partial signup or a concurrent login).
  let id: string | null = null;
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
    .upsert({ id, role: "complainant", phone, preferred_locale: locale }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    // A concurrent login may have created the profile first.
    const { data: again } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (again) return again.id;
    throw new Error(`could not create profile: ${error.message}`);
  }
  return id;
}
