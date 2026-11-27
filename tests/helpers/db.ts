import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates (or reuses) a user with a profile of the given role and returns a client signed in as them. */
export async function signInAs(
  role: "complainant" | "advocate" | "staff" | "admin" | "commissioner",
  phone: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const admin = adminClient();
  const email = `${phone.replace(/\D/g, "")}@test.mizani.local`;
  const password = "test-password-123";
  const created = await admin.auth.admin.createUser({
    email,
    phone,
    password,
    email_confirm: true,
    phone_confirm: true,
  });
  let userId = created.data.user?.id;
  if (!userId) {
    // Already exists (fixed test phones are reused across runs). Look it up by email: listing users is paged and
    // the shared dev project holds thousands of test accounts.
    const { data: existing, error } = await admin.rpc("auth_user_id_by_email", { p_email: email });
    if (error || !existing) throw new Error(`test user ${email} could not be created or found: ${created.error?.message ?? error?.message}`);
    userId = existing as string;
  }
  await admin
    .from("profiles")
    .upsert({ id: userId, role, full_name: `Test ${role}`, phone });
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, userId };
}

/** An advocate account (phone sign-in) linked to a fresh synthetic roll entry. */
export async function signInAdvocate(
  phone: string,
): Promise<{ client: SupabaseClient; userId: string; advocateId: string; admissionNo: string }> {
  const { client, userId } = await signInAs("advocate", phone);
  const admin = adminClient();
  await admin.from("profiles").update({ full_name: `Advocate ${phone.slice(-4)}` }).eq("id", userId);
  const admissionNo = `P.105/T${phone.slice(-4)}/${Date.now()}`;
  const { data, error } = await admin
    .from("advocates")
    .insert({ admission_no: admissionNo, full_name: `Advocate ${phone.slice(-4)}`, phone, profile_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return { client, userId, advocateId: data.id as string, admissionNo };
}

export const STAFF_TEST_PASSWORD = "Staff-test-password-123!";

/** Creates a staff-type user with an enrolled + verified TOTP factor; returns an aal2 client. */
export async function signInStaff(
  role: "staff" | "admin" | "commissioner",
  email: string,
  office = "Nairobi",
): Promise<{ client: SupabaseClient; userId: string; totpSecret: string; email: string }> {
  const { authenticator } = await import("otplib");
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, password: STAFF_TEST_PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user!.id;
  const { error: pErr } = await admin
    .from("profiles")
    .insert({ id: userId, role, full_name: `Test ${role} ${email.split("@")[0]}`, office });
  if (pErr) throw pErr;

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: STAFF_TEST_PASSWORD });
  if (error) throw error;
  const { data: enrol, error: eErr } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "test" });
  if (eErr) throw eErr;
  const totpSecret = enrol.totp.secret;
  const { error: vErr } = await client.auth.mfa.challengeAndVerify({
    factorId: enrol.id,
    code: authenticator.generate(totpSecret),
  });
  if (vErr) throw vErr;
  return { client, userId, totpSecret, email };
}

/** Inserts a case directly (service role) for test setup. */
export async function makeCase(complainantId: string, overrides: Record<string, unknown> = {}) {
  const admin = adminClient();
  const { data: num } = await admin.rpc("next_case_number");
  const { data, error } = await admin
    .from("cases")
    .insert({
      case_number: num,
      complainant_id: complainantId,
      filed_by: complainantId,
      advocate_name_given: "Test Advocate",
      summary: "Test complaint summary",
      description: "A test description that is long enough to be valid.",
      language: "en",
      channel: "online",
      pin_hash: "x",
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; case_number: string };
}

/**
 * A complainant or advocate account that can sign in through the real phone + SMS-code flow
 * (same auth email shape as the app's phoneEmail). Advocates also get a linked roll entry.
 */
export async function createPhoneAccount(
  role: "complainant" | "advocate",
  e164: string,
): Promise<{ userId: string; advocateId?: string }> {
  const admin = adminClient();
  const email = `${e164.replace(/\D/g, "")}@phone.mizani.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const userId = data.user.id;
  const name = role === "advocate" ? `Advocate ${e164.slice(-4)}` : `Complainant ${e164.slice(-4)}`;
  const { error: pErr } = await admin.from("profiles").upsert({ id: userId, role, full_name: name, phone: e164, active: true });
  if (pErr) throw pErr;
  if (role === "complainant") return { userId };
  const { data: roll, error: rErr } = await admin
    .from("advocates")
    .insert({ admission_no: `P.105/PH${e164.slice(-4)}/${Date.now()}`, full_name: name, phone: e164, profile_id: userId })
    .select("id")
    .single();
  if (rErr) throw rErr;
  return { userId, advocateId: roll.id as string };
}
