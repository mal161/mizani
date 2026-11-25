import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { logAudit } from "@/lib/audit";

export function requireAdminActor(actor: StaffUser): void {
  if (actor.role !== "admin") throw new ForbiddenError("admin only");
}

export async function auditAdmin(
  actor: StaffUser,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await logAudit({ actorId: actorId(actor), channel: "web", action, entity, entityId, details });
}
