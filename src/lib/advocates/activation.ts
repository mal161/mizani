import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin, verifyPin } from "@/lib/pin";
import { normalizeKenyanPhone } from "@/lib/phone";
import { logAudit } from "@/lib/audit";
import { phoneEmail } from "@/lib/auth/accounts";
import { requestLoginCode, consumeLoginCode, sessionTokenFor, type VerifyResult } from "@/lib/auth/otp";
import type { Locale } from "@/i18n/routing";
import { generateActivationCode, normaliseActivationCode } from "./activation-code";

const CODE_TTL_DAYS = 30;
// Compared against when nothing matches, so a missing notice takes as long as a wrong code (no timing oracle).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.9mQ5b8f0n6Tg6l0yWb1nT1i6pQ7u";

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

export type StartResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "phone_in_use" | "invalid_phone" | "rate_limited" | "sms_failed" | "already_activated" };

function normaliseAdmissionNo(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Step 1: admission number + code from the notice + the phone the advocate will sign in with.
 * Admission numbers are public, so: a per-caller limit, and one generic "invalid" answer whether the number is
 * unknown, has no pending notice, the code is wrong, or the code is locked — and the same work in every case.
 * On success an SMS login code goes to that phone (step 2 proves they hold it).
 */
export async function startAdvocateActivation(
  input: { admissionNo: string; code: string; phone: string },
  locale: Locale,
  caller: string | null = null,
): Promise<StartResult> {
  const phone = normalizeKenyanPhone(input.phone);
  if (!phone) return { ok: false, reason: "invalid_phone" };
  const admin = createAdminClient();
  if (caller) {
    const { data: allowed } = await admin.rpc("note_activation_request", { p_caller: caller });
    if (!allowed) return { ok: false, reason: "rate_limited" };
  }
  const code = normaliseActivationCode(input.code);

  // Exact, case-insensitive match; wildcards in the input are escaped.
  const pattern = normaliseAdmissionNo(input.admissionNo).replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data: advocates } = await admin.from("advocates").select("id,profile_id").ilike("admission_no", pattern).limit(2);
  const advocate = advocates?.length === 1 ? advocates[0] : null;

  const rows = advocate
    ? (((await admin.rpc("claim_activation_attempts", { p_advocate_id: advocate.id })).data ?? []) as {
        id: string;
        case_id: string;
        code_hash: string;
      }[])
    : [];
  let match: (typeof rows)[number] | undefined;
  for (const r of rows) {
    if (/^[A-Z0-9]{8}$/.test(code) && (await verifyPin(code, r.code_hash))) match = r;
  }
  if (rows.length === 0) await verifyPin(code || "x", DUMMY_HASH);
  if (!advocate || !match) return { ok: false, reason: "invalid" };

  // A correct code does not spend the attempt budget.
  await admin.from("advocate_activations").update({ attempts: 0 }).eq("id", match.id);

  if (advocate.profile_id) {
    // Already activated: only the account's own phone may continue (it simply signs in).
    const { data: own } = await admin.from("profiles").select("phone").eq("id", advocate.profile_id).maybeSingle();
    if (own?.phone !== phone) return { ok: false, reason: "already_activated" };
  } else {
    const { data: owner } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (owner) return { ok: false, reason: "phone_in_use" };
  }

  await admin.from("advocate_activations").update({ pending_phone: phone }).eq("id", match.id);
  const sent = await requestLoginCode(phone, locale, caller);
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return { ok: true };
}

export type CompleteResult = VerifyResult | { ok: false; reason: "phone_in_use" };

/**
 * Step 2: the SMS code proves the phone. Creates (or reuses) the advocate account, links it to the roll entry,
 * retires the activation, and returns a sign-in token for that account. Refuses (never throws) when the phone
 * became someone else's account in the meantime.
 */
export async function completeAdvocateActivation(rawPhone: string, smsCode: string): Promise<CompleteResult> {
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

  const { data: owner } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  let userId: string;
  if (roll.profile_id) {
    if (owner?.id !== roll.profile_id) {
      await admin.from("advocate_activations").update({ pending_phone: null }).eq("id", activation.id);
      return { ok: false, reason: "phone_in_use" };
    }
    userId = roll.profile_id;
  } else {
    if (owner) {
      await admin.from("advocate_activations").update({ pending_phone: null }).eq("id", activation.id);
      return { ok: false, reason: "phone_in_use" };
    }
    const email = phoneEmail(phone);
    const created = await admin.auth.admin.createUser({ email, phone, email_confirm: true, phone_confirm: true });
    if (created.data.user) userId = created.data.user.id;
    else {
      const { data: existingId } = await admin.rpc("auth_user_id_by_email", { p_email: email });
      if (!existingId) throw new Error(`could not create advocate user: ${created.error?.message}`);
      userId = existingId as string;
    }
    const { error: pErr } = await admin.from("profiles").insert({ id: userId, role: "advocate", phone, full_name: roll.full_name });
    if (pErr) {
      await admin.from("advocate_activations").update({ pending_phone: null }).eq("id", activation.id);
      return { ok: false, reason: "phone_in_use" };
    }
    // Only link if nobody else linked this roll entry concurrently.
    const { data: linked } = await admin
      .from("advocates")
      .update({ profile_id: userId })
      .eq("id", activation.advocate_id)
      .is("profile_id", null)
      .select("id");
    if (!linked?.length) return { ok: false, reason: "invalid_code" };
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
  return { ok: true, email, tokenHash, userId, role: "advocate" };
}
