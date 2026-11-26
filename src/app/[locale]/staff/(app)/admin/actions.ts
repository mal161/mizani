"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { isStaffRole } from "@/lib/auth/staff-gate";
import { createStaffUserAs, setUserActiveAs, changeUserRoleAs } from "@/lib/admin/users";
import { updateWorkflowSettingsAs, type SettingsPatch } from "@/lib/admin/settings";
import { saveRoutingRuleAs, deleteRoutingRuleAs } from "@/lib/admin/routing-rules";
import { STAGES } from "@/lib/cases/stages";

export type AdminState = { ok?: boolean; error?: string; tempPassword?: string; at?: number };

async function guarded(path: string, fn: () => Promise<AdminState | void>): Promise<AdminState> {
  try {
    const r = (await fn()) ?? { ok: true };
    revalidatePath(path);
    return { ...r, ok: true, at: Date.now() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "forbidden", at: Date.now() };
    const msg = e instanceof Error ? e.message : String(e);
    if (/yourself/.test(msg)) return { error: "self", at: Date.now() };
    console.error("admin action failed", e);
    return { error: "invalid", at: Date.now() };
  }
}

const pathOf = (fd: FormData) => String(fd.get("path") ?? "/");

export async function createUserAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  return guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    const role = String(fd.get("role"));
    if (!isStaffRole(role)) return { error: "invalid" };
    const r = await createStaffUserAs(actor, {
      email: String(fd.get("email") ?? ""),
      fullName: String(fd.get("fullName") ?? ""),
      role,
      office: String(fd.get("office") ?? ""),
    });
    return { tempPassword: r.tempPassword };
  });
}

export async function setActiveAction(fd: FormData): Promise<void> {
  await guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    await setUserActiveAs(actor, String(fd.get("userId")), fd.get("active") === "true");
  });
}

export async function changeRoleAction(fd: FormData): Promise<void> {
  await guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    const role = String(fd.get("role"));
    if (!isStaffRole(role)) throw new Error("invalid role");
    await changeUserRoleAs(actor, String(fd.get("userId")), role);
  });
}

export async function saveSettingsAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  return guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    const slaDays: Record<string, number> = {};
    const labels: { en: Record<string, string>; sw: Record<string, string> } = { en: {}, sw: {} };
    for (const s of STAGES) {
      if (s !== "closed") slaDays[s] = Number.parseInt(String(fd.get(`sla_${s}`) ?? ""), 10);
      labels.en[s] = String(fd.get(`label_en_${s}`) ?? "");
      labels.sw[s] = String(fd.get(`label_sw_${s}`) ?? "");
    }
    const patch: SettingsPatch = {
      slaDays: slaDays as SettingsPatch["slaDays"],
      conciliationEnabled: fd.get("conciliationEnabled") === "on",
      aiEnabled: fd.get("aiEnabled") === "on",
      advocateResponseDays: Number.parseInt(String(fd.get("advocateResponseDays") ?? ""), 10),
      categories: String(fd.get("categories") ?? "")
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter(Boolean),
      stageLabels: labels as SettingsPatch["stageLabels"],
    };
    await updateWorkflowSettingsAs(actor, patch);
  });
}

export async function saveRuleAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  return guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    const priority = String(fd.get("priority") ?? "");
    await saveRoutingRuleAs(actor, {
      position: Number.parseInt(String(fd.get("position") ?? "0"), 10) || 0,
      category: String(fd.get("category") ?? "") || null,
      priority: (["low", "normal", "high", "urgent"].includes(priority) ? priority : null) as never,
      office: String(fd.get("office") ?? "") || null,
      officerIds: fd.getAll("officerIds").map(String),
      active: true,
    });
  });
}

export async function deleteRuleAction(fd: FormData): Promise<void> {
  await guarded(pathOf(fd), async () => {
    const actor = await assertStaff(["admin"]);
    await deleteRoutingRuleAs(actor, String(fd.get("ruleId")));
  });
}
