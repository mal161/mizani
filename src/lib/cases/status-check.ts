import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/pin";
import { logAudit } from "@/lib/audit";
import { isStage, type Stage } from "./stages";

/** What the complainant may need to do or know, as yes/no only: the details stay behind sign-in. */
export interface StatusActions {
  /** The Commission's latest information request has not been answered yet. */
  infoRequested: boolean;
  /** A hearing is scheduled in the future. */
  hearingScheduled: boolean;
  /** A decision has been issued (the current, non-superseded one). */
  decisionIssued: boolean;
}

export type StatusResult =
  | { ok: true; stage: Stage; stageSince: string; actions: StatusActions }
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
    .select("id,stage,created_at,pin_hash")
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
  const stage: Stage = isStage(c.stage) ? c.stage : "received";
  const [{ data: moved }, { data: requests }, { count: hearings }, { count: decisions }] = await Promise.all([
    // When the case entered its current stage (filing date for "received" or if no move is recorded).
    admin
      .from("case_events")
      .select("created_at")
      .eq("case_id", c.id)
      .eq("type", "stage_changed")
      .eq("body->>to", stage)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("case_events")
      .select("type")
      .eq("case_id", c.id)
      .in("type", ["info_requested", "info_provided"])
      .order("created_at", { ascending: false })
      .limit(1),
    admin.from("hearings").select("id", { count: "exact", head: true }).eq("case_id", c.id).eq("status", "scheduled").gt("starts_at", new Date().toISOString()),
    admin.from("decisions").select("id", { count: "exact", head: true }).eq("case_id", c.id).is("superseded_by", null),
  ]);
  return {
    ok: true,
    stage,
    stageSince: (moved?.created_at as string | undefined) ?? c.created_at,
    actions: {
      infoRequested: requests?.[0]?.type === "info_requested",
      hearingScheduled: (hearings ?? 0) > 0,
      decisionIssued: (decisions ?? 0) > 0,
    },
  };
}
