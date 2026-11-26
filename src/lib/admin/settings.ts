import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { STAGES } from "@/lib/cases/stages";
import { requireAdminActor, auditAdmin } from "./guard";

const stageKeys = STAGES.filter((s) => s !== "closed") as unknown as [string, ...string[]];
const slaSchema = z.partialRecord(z.enum(stageKeys), z.number().int().min(1).max(365));
const labelMap = z.partialRecord(z.enum(STAGES as unknown as [string, ...string[]]), z.string().trim().max(40));

export const settingsPatchSchema = z
  .object({
    slaDays: slaSchema,
    conciliationEnabled: z.boolean(),
    stageLabels: z.object({ en: labelMap, sw: labelMap }),
    categories: z
      .array(z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/))
      .min(1)
      .max(30),
    advocateResponseDays: z.number().int().min(7).max(60),
    aiEnabled: z.boolean(),
  })
  .partial();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const KEY: Record<keyof SettingsPatch, string> = {
  slaDays: "sla_days",
  conciliationEnabled: "conciliation_enabled",
  stageLabels: "stage_labels",
  categories: "categories",
  advocateResponseDays: "advocate_response_days",
  aiEnabled: "ai_enabled",
};

/** Validates and saves workflow settings; each changed key is audited with its before/after values. */
export async function updateWorkflowSettingsAs(actor: StaffUser, patch: SettingsPatch): Promise<void> {
  requireAdminActor(actor);
  const p = settingsPatchSchema.parse(patch);
  const admin = createAdminClient();
  for (const [field, value] of Object.entries(p) as [keyof SettingsPatch, unknown][]) {
    if (value === undefined) continue;
    const key = KEY[field];
    const { data: before } = await admin.from("settings").select("value").eq("key", key).maybeSingle();
    let next = value;
    if (field === "slaDays" && before?.value && typeof before.value === "object") {
      next = { ...(before.value as object), ...(value as object) }; // partial SLA edits merge
    }
    if (field === "stageLabels") {
      // Drop empty strings so the translation is used again.
      const v = value as Record<string, Record<string, string>>;
      next = Object.fromEntries(
        Object.entries(v).map(([l, m]) => [l, Object.fromEntries(Object.entries(m).filter(([, s]) => s.trim()))]),
      );
    }
    const { error } = await admin.from("settings").upsert({ key, value: next });
    if (error) throw new Error(`save ${key}: ${error.message}`);
    await auditAdmin(actor, "admin_update_settings", "settings", key, { before: before?.value ?? null, after: next });
  }
}
