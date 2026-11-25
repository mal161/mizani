import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { isStage, type Stage } from "./stages";

export type StatusResult =
  | { ok: true; stage: Stage; updatedAt: string }
  | { ok: false; reason: "invalid" | "locked" };

/**
 * Public status lookup by case number + PIN (web status page and USSD).
 * Unknown case and wrong PIN look identical. Lockout (enforced atomically in the database):
 * 5 failures per caller per case per hour, and 30 failures per case per hour from all callers.
 * The attempt is recorded as a failure before the PIN is checked, so parallel guesses count.
 * `caller` identifies the requester: client IP on the web, MSISDN on USSD.
 */
export async function checkStatus(
  caseNumber: string,
  pin: string,
  channel: "web" | "ussd",
  caller: string,
): Promise<StatusResult> {
  const admin = createAdminClient();

  const { data: c } = await admin
    .from("cases")
    .select("id,stage,updated_at,pin_hash")
    .eq("case_number", caseNumber)
    .maybeSingle();
  const entityId = c?.id ?? caseNumber;

  const { data: attemptId, error } = await admin.rpc("begin_status_attempt", {
    p_case_number: caseNumber,
    p_caller: caller,
    p_channel: channel,
  });
  if (error) throw new Error(`status attempt: ${error.message}`);
  if (attemptId === null) {
    await logAudit({ actorId: null, channel, action: "status_check", entity: "cases", entityId, details: { ok: false, locked: true, caller } });
    return { ok: false, reason: "locked" };
  }

  const ok = !!c && /^\d{6}$/.test(pin) && (await verifyPin(pin, c.pin_hash));
  if (ok) {
    const { error: upd } = await admin.from("status_attempts").update({ success: true }).eq("id", attemptId);
    if (upd) throw new Error(`status attempt update: ${upd.message}`);
  }
  await logAudit({ actorId: null, channel, action: "status_check", entity: "cases", entityId, details: { ok, caller } });

  if (!ok || !c) return { ok: false, reason: "invalid" };
  return { ok: true, stage: isStage(c.stage) ? c.stage : "received", updatedAt: c.updated_at };
}
