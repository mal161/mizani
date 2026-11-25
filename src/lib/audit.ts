import { createAdminClient } from "@/lib/supabase/admin";

export type AuditChannel = "web" | "ussd" | "sms" | "system";

export interface AuditEntry {
  actorId: string | null;
  channel: AuditChannel;
  action: "view" | "download" | "status_check" | (string & {});
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}

/** Appends a row to the immutable audit log. Throws if the write fails: unaudited access is not allowed. */
export async function logAudit(e: AuditEntry): Promise<void> {
  const { error } = await createAdminClient().from("audit_log").insert({
    actor_id: e.actorId,
    actor_channel: e.channel,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId,
    details: e.details ?? {},
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
