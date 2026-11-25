import type { CurrentUser } from "./types";
import type { StaffRole } from "./staff-gate";

export type StaffUser = CurrentUser & { role: StaffRole };

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The system itself (automatic routing, cron). Not a profile row: actor_id is stored as null. */
export const SYSTEM_ACTOR: StaffUser = { id: "system", role: "admin", phone: null, full_name: "Mizani" };

export function actorId(actor: StaffUser): string | null {
  return actor.id === "system" ? null : actor.id;
}
