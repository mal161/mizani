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
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = data.users.find((u) => u.email === email)!.id;
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
