import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin, verifyPin } from "@/lib/pin";
import { normalizeKenyanPhone } from "@/lib/phone";
import { logAudit } from "@/lib/audit";
import { phoneEmail } from "@/lib/auth/accounts";
import { requestLoginCode, consumeLoginCode, sessionTokenFor, type VerifyResult } from "@/lib/auth/otp";
import type { Locale } from "@/i18n/routing";
import { generateActivationCode, normaliseActivationCode } from "./activation-code";

const CODE_TTL_DAYS = 30;

/**
 * Issues the activation code printed on the notice letter. Returns the clear code once; only a hash is stored.
 * Any unused code for the same case is retired first (re-notification).
 */
export async function createActivation(caseId: string, advocateId: string, createdBy: string | null): Promise<string> {
  const admin = createAdminClient();
  await admin.from("advocate_activations").update({ used_at: new Date().toISOString() }).eq("case_id", caseId).is("used_at", null);
  const code = generateActivationCode();
  const { error } = await admin.from("advocate_activations").insert({
    case_id: caseId,
    advocate_id: advocateId,
    code_hash: await hashPin(code),
    expires_at: new Date(Date.now() + CODE_TTL_DAYS * 86_400_000).toISOString(),
    created_by: createdBy,
  });
  if (error) throw new Error(`create activation: ${error.message}`);
  return code;
}

export type StartResult = { ok: true } | { ok: false; reason: "invalid" | "locked" | "phone_in_use" | "invalid_phone" };

/**
 * Step 1: admission number + code from the notice + the phone the advocate will sign in with.
 * On success an SMS login code goes to that phone (step 2 proves they hold it).
 */
export async function startAdvocateActivation(
  input: { admissionNo: string; code: string; phone: string },
  locale: Locale,
): Promise<StartResult> {
  const phone = normalizeKenyanPhone(input.phone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  const admin = createAdminClient();

  const { data: advocate } = await admin
    .from("advocates")
    .select("id,profile_id")
    .ilike("admission_no", input.admissionNo.trim())
    .maybeSingle();
  if (!advocate) return { ok: false, reason: "invalid" };

  const { data: rows, error } = await admin.rpc("claim_activation_attempts", { p_advocate_id: advocate.id });
  if (error) throw new Error(`activation check: ${error.message}`);
  const candidates = (rows ?? []) as { id: string; case_id: string; code_hash: string }[];
  if (candidates.length === 0) {
    const { count } = await admin
      .from("advocate_activations")
      .select("id", { count: "exact", head: true })
      .eq("advocate_id", advocate.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .gte("attempts", 5);
    return { ok: false, reason: (count ?? 0) > 0 ? "locked" : "invalid" };
  }
  const code = normaliseActivationCode(input.code);
  let match: (typeof candidates)[number] | undefined;
  for (const c of candidates) {
    if (/^[A-Z0-9]{8}$/.test(code) && (await verifyPin(code, c.code_hash))) match = c;
  }
  if (!match) return { ok: false, reason: "invalid" };

  // The phone must be free, or already this advocate's own account.
  const { data: owner } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (owner && owner.id !== advocate.profile_id) return { ok: false, reason: "phone_in_use" };

  await admin.from("advocate_activations").update({ pending_phone: phone }).eq("id", match.id);
  const sent = await requestLoginCode(phone, locale, null);
  if (!sent.ok) return { ok: false, reason: sent.reason === "invalid_phone" ? "invalid_phone" : "locked" };
  return { ok: true };
}

/**
 * Step 2: the SMS code proves the phone. Creates (or reuses) the advocate account, links it to the roll entry,
 * retires the activation, and returns a sign-in token like a normal login.
 */
export async function completeAdvocateActivation(rawPhone: string, smsCode: string): Promise<VerifyResult> {
  const phone = normalizeKenyanPhone(rawPhone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  if (!(await consumeLoginCode(phone, smsCode))) return { ok: false, reason: "invalid_code" };
  const admin = createAdminClient();

  const { data: activation } = await admin
    .from("advocate_activations")
    .select("id,case_id,advocate_id,advocates(full_name,profile_id)")
    .eq("pending_phone", phone)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activation) return { ok: false, reason: "invalid_code" };
  const roll = activation.advocates as unknown as { full_name: string; profile_id: string | null };

  let userId = roll.profile_id;
  if (!userId) {
    const email = phoneEmail(phone);
    const created = await admin.auth.admin.createUser({ email, phone, email_confirm: true, phone_confirm: true });
    if (created.data.user) userId = created.data.user.id;
    else {
      const { data: existingId } = await admin.rpc("auth_user_id_by_email", { p_email: email });
      if (!existingId) throw new Error(`could not create advocate user: ${created.error?.message}`);
      userId = existingId as string;
    }
    const { error: pErr } = await admin
      .from("profiles")
      .insert({ id: userId, role: "advocate", phone, full_name: roll.full_name });
    if (pErr) throw new Error(`could not create advocate profile: ${pErr.message}`);
    await admin.from("advocates").update({ profile_id: userId }).eq("id", activation.advocate_id);
  }

  await admin.from("advocate_activations").update({ used_at: new Date().toISOString() }).eq("id", activation.id);
  await logAudit({
    actorId: userId,
    channel: "web",
    action: "advocate_activated",
    entity: "advocates",
    entityId: activation.advocate_id,
    details: { case_id: activation.case_id },
  });
  const { email, tokenHash } = await sessionTokenFor(phone);
  return { ok: true, email, tokenHash, userId: userId!, role: "advocate" };
}
