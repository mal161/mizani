import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { adminClient } from "../helpers/db";

describe("logAudit", () => {
  it("writes a row with actor, channel and details", async () => {
    const entityId = randomUUID();
    await logAudit({
      actorId: null,
      channel: "ussd",
      action: "status_check",
      entity: "cases",
      entityId,
      details: { ok: false },
    });
    const { data } = await adminClient()
      .from("audit_log")
      .select("actor_channel,action,details")
      .eq("entity_id", entityId);
    expect(data).toEqual([
      { actor_channel: "ussd", action: "status_check", details: { ok: false } },
    ]);
  });
});
