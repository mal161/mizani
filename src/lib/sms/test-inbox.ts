import { createAdminClient } from "@/lib/supabase/admin";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";

/**
 * Test SMS inbox: while SMS is in test mode, keep a copy of every message Mizani would have texted so an
 * administrator can read sign-in codes and PINs without a real SMS provider. Records only with SMS_TEST_INBOX=on
 * and a fake provider; with real SMS on it records nothing, shows nothing, and the daily purge empties it.
 */
const KEEP_MS = 7 * 86_400_000;

export const realSmsOn = () => process.env.SMS_PROVIDER === "africastalking";
export const testInboxEnabled = () =>
  !realSmsOn() && process.env.SMS_TEST_INBOX === "on";

/** Best effort: a failure here must never stop the (fake) send. */
export async function recordTestSms(
  to: string,
  message: string,
): Promise<void> {
  if (!testInboxEnabled()) return;
  try {
    const { error } = await createAdminClient()
      .from("test_sms_outbox")
      .insert({ to_phone: to, message });
    if (error) console.error("test SMS inbox: could not record", error.message);
  } catch (e) {
    console.error("test SMS inbox: could not record", e);
  }
}

export interface TestSms {
  id: string;
  to_phone: string;
  message: string;
  created_at: string;
}

/** Administrators only. `live` when real SMS is on (nothing is shown then). */
export async function listTestSmsAs(
  actor: StaffUser,
  limit = 200,
): Promise<{ live: boolean; enabled: boolean; rows: TestSms[] }> {
  if (actor.role !== "admin") throw new ForbiddenError();
  if (realSmsOn()) return { live: true, enabled: false, rows: [] };
  const { data, error } = await createAdminClient()
    .from("test_sms_outbox")
    .select("id,to_phone,message,created_at")
    .gt("created_at", new Date(Date.now() - KEEP_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`test SMS inbox: ${error.message}`);
  return {
    live: false,
    enabled: testInboxEnabled(),
    rows: (data ?? []) as TestSms[],
  };
}

/** Daily: drop messages older than 7 days; once real SMS is on, drop them all. */
export async function purgeTestSms(now: Date): Promise<number> {
  const cutoff = realSmsOn() ? now : new Date(now.getTime() - KEEP_MS);
  const { data, error } = await createAdminClient()
    .from("test_sms_outbox")
    .delete()
    .lt("created_at", cutoff.toISOString())
    .select("id");
  if (error) throw new Error(`purge test SMS: ${error.message}`);
  return data?.length ?? 0;
}
