import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhone } from "@/lib/phone";
import { generatePin, hashPin, verifyPin } from "@/lib/pin";
import { getSmsProvider } from "@/lib/sms";
import { logAudit } from "@/lib/audit";
import { resolveAccountForPhone, phoneEmail } from "./accounts";
import type { Locale } from "@/i18n/routing";

const CODE_TTL_MS = 10 * 60 * 1000;

const codeSms: Record<Locale, (code: string) => string> = {
  en: (c) => `Your Mizani login code is ${c}. It expires in 10 minutes. Do not share it.`,
  sw: (c) => `Nambari yako ya kuingia Mizani ni ${c}. Inaisha baada ya dakika 10. Usimpe mtu.`,
};

export { phoneEmail } from "./accounts";

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

export type PortalRole = "complainant" | "advocate";

export type VerifyResult =
  | { ok: true; email: string; tokenHash: string; userId: string; role: PortalRole }
  | { ok: false; reason: "invalid_phone" | "invalid_code" };

/**
 * Checks and consumes an SMS login code for a normalised phone. An attempt is consumed atomically *before*
 * comparing (parallel guesses cannot exceed the cap) and a code works once.
 */
export async function consumeLoginCode(phone: string, code: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: claimedRows, error: claimErr } = await admin.rpc("claim_login_attempt", { p_phone: phone });
  if (claimErr) throw new Error(`could not check login code: ${claimErr.message}`);
  const row = (claimedRows as { id: string; code_hash: string }[] | null)?.[0];
  if (!row) return false;
  if (!/^\d{6}$/.test(code) || !(await verifyPin(code, row.code_hash))) return false;
  const { data: claimed } = await admin
    .from("login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  return Boolean(claimed?.length);
}

/** A one-time token the server action exchanges for a session cookie. */
export async function sessionTokenFor(phone: string): Promise<{ email: string; tokenHash: string }> {
  const email = phoneEmail(phone);
  const { data: link, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) throw new Error(`could not create session link: ${error?.message}`);
  return { email, tokenHash: link.properties.hashed_token };
}

export async function verifyLoginCode(
  rawPhone: string,
  code: string,
  locale: Locale = "en",
): Promise<VerifyResult> {
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  if (!(await consumeLoginCode(phone, code))) return { ok: false, reason: "invalid_code" };

  // Complainant or active advocate; staff phones never sign in here (same message as a wrong code).
  const account = await resolveAccountForPhone(phone, locale);
  if (!account) return { ok: false, reason: "invalid_code" };
  const { email, tokenHash } = await sessionTokenFor(phone);
  await logAudit({ actorId: account.id, channel: "web", action: "login", entity: "profiles", entityId: account.id });
  return { ok: true, email, tokenHash, userId: account.id, role: account.role };
}
