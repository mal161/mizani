import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { isStage, type Stage } from "./stages";

const MAX_FAILURES = 5;
const WINDOW_MS = 60 * 60 * 1000;

export type StatusResult =
  | { ok: true; stage: Stage; updatedAt: string }
  | { ok: false; reason: "invalid" | "locked" };

/**
 * Public status lookup by case number + PIN (web status page and USSD).
 * Unknown case and wrong PIN look identical; 5 failures per case in a rolling hour lock it.
 * Every attempt is audited.
 */
export async function checkStatus(
  caseNumber: string,
  pin: string,
  channel: "web" | "ussd",
): Promise<StatusResult> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await admin
    .from("status_attempts")
    .select("id", { count: "exact", head: true })
    .eq("case_number", caseNumber)
    .eq("success", false)
    .gte("at", since);

  const { data: c } = await admin
    .from("cases")
    .select("id,stage,updated_at,pin_hash")
    .eq("case_number", caseNumber)
    .maybeSingle();
  const entityId = c?.id ?? caseNumber;

  if ((count ?? 0) >= MAX_FAILURES) {
    await logAudit({ actorId: null, channel, action: "status_check", entity: "cases", entityId, details: { ok: false, locked: true } });
    return { ok: false, reason: "locked" };
  }

  const ok = !!c && /^\d{6}$/.test(pin) && (await verifyPin(pin, c.pin_hash));
  await admin.from("status_attempts").insert({ case_number: caseNumber, success: ok, channel });
  await logAudit({ actorId: null, channel, action: "status_check", entity: "cases", entityId, details: { ok } });

  if (!ok || !c) {
    const failures = (count ?? 0) + 1;
    return { ok: false, reason: failures >= MAX_FAILURES ? "locked" : "invalid" };
  }
  return { ok: true, stage: isStage(c.stage) ? c.stage : "received", updatedAt: c.updated_at };
}
