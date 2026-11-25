import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/auth/staff-types";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { requireAdminActor, auditAdmin } from "./guard";

const ruleSchema = z.object({
  id: z.uuid().optional(),
  position: z.number().int().min(-10000).max(10000),
  category: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
  office: z.string().trim().max(60).nullable().optional(),
  officerIds: z.array(z.uuid()).min(1).max(50),
  active: z.boolean().optional(),
});

export type RoutingRuleInput = z.infer<typeof ruleSchema>;

/** Creates or updates a rule. Every officer in the pool must be an active staff or admin account. */
export async function saveRoutingRuleAs(actor: StaffUser, input: RoutingRuleInput): Promise<string> {
  requireAdminActor(actor);
  const r = ruleSchema.parse(input);
  const admin = createAdminClient();
  if (r.category) {
    const cfg = await loadWorkflowConfig();
    if (!cfg.categories.includes(r.category)) throw new Error(`unknown category ${r.category}`);
  }
  const ids = [...new Set(r.officerIds)];
  const { data: found } = await admin.from("profiles").select("id").in("id", ids).in("role", ["staff", "admin"]).eq("active", true);
  if ((found ?? []).length !== ids.length) throw new Error("every officer must be an active staff or admin account");

  const row = {
    position: r.position,
    category: r.category || null,
    priority: r.priority || null,
    office: r.office?.trim() || null,
    officer_ids: ids,
    active: r.active ?? true,
  };
  let before: unknown = null;
  let id = r.id;
  if (id) {
    const { data: old } = await admin.from("routing_rules").select("*").eq("id", id).maybeSingle();
    if (!old) throw new Error("rule not found");
    before = old;
    const { error } = await admin.from("routing_rules").update(row).eq("id", id);
    if (error) throw new Error(`update rule: ${error.message}`);
  } else {
    const { data, error } = await admin.from("routing_rules").insert(row).select("id").single();
    if (error) throw new Error(`create rule: ${error.message}`);
    id = data.id as string;
  }
  await auditAdmin(actor, "admin_save_routing_rule", "routing_rules", id!, { before, after: row });
  return id!;
}

export async function deleteRoutingRuleAs(actor: StaffUser, id: string): Promise<void> {
  requireAdminActor(actor);
  const admin = createAdminClient();
  const { data: old } = await admin.from("routing_rules").select("*").eq("id", id).maybeSingle();
  if (!old) return;
  const { error } = await admin.from("routing_rules").delete().eq("id", id);
  if (error) throw new Error(`delete rule: ${error.message}`);
  await auditAdmin(actor, "admin_delete_routing_rule", "routing_rules", id, { before: old });
}

/** Sets positions 10, 20, 30… in the given order. */
export async function reorderRoutingRulesAs(actor: StaffUser, ids: string[]): Promise<void> {
  requireAdminActor(actor);
  const admin = createAdminClient();
  for (const [i, id] of ids.entries()) {
    const { error } = await admin.from("routing_rules").update({ position: (i + 1) * 10 }).eq("id", id);
    if (error) throw new Error(`reorder: ${error.message}`);
  }
  await auditAdmin(actor, "admin_reorder_routing_rules", "routing_rules", "*", { order: ids });
}
