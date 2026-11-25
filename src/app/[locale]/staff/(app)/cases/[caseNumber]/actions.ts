"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import {
  changeStageAs,
  addNoteAs,
  assignCaseAs,
  setCategoryPriorityAs,
  requestInfoAs,
  PRIORITIES,
  type Priority,
} from "@/lib/cases/actions";
import { isStage } from "@/lib/cases/stages";

export type ActionState = { ok?: boolean; error?: string; at?: number };

/** Officers and admins act on cases; commissioners are read-only here (their portal is Plan 5). */
const WRITERS = ["staff", "admin"] as const;

async function run(formData: FormData, fn: (caseId: string) => Promise<ActionState | void>): Promise<ActionState> {
  const caseId = String(formData.get("caseId") ?? "");
  const path = String(formData.get("path") ?? "");
  try {
    const r = (await fn(caseId)) ?? { ok: true };
    if (r.ok && path.startsWith("/")) revalidatePath(path);
    return { ...r, at: Date.now() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "forbidden", at: Date.now() };
    console.error("staff case action failed", e);
    return { error: "invalid", at: Date.now() };
  }
}

export async function changeStageAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, async (caseId) => {
    const actor = await assertStaff(WRITERS);
    const from = String(formData.get("from"));
    const to = String(formData.get("to"));
    if (!isStage(from) || !isStage(to)) return { error: "not_allowed" };
    const r = await changeStageAs(actor, caseId, from, to, String(formData.get("reason") ?? ""));
    return r.ok ? { ok: true } : { error: r.reason };
  });
}

export async function addNoteAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, async (caseId) => {
    const actor = await assertStaff(WRITERS);
    await addNoteAs(actor, caseId, String(formData.get("text") ?? ""));
  });
}

export async function assignAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, async (caseId) => {
    const actor = await assertStaff(WRITERS);
    const officer = String(formData.get("officerId") ?? "");
    await assignCaseAs(actor, caseId, officer || null);
  });
}

export async function triageAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, async (caseId) => {
    const actor = await assertStaff(WRITERS);
    const category = String(formData.get("category") ?? "");
    const priority = String(formData.get("priority") ?? "normal");
    if (!(PRIORITIES as readonly string[]).includes(priority)) return { error: "invalid" };
    await setCategoryPriorityAs(actor, caseId, category || null, priority as Priority);
  });
}

export async function requestInfoAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  return run(formData, async (caseId) => {
    const actor = await assertStaff(WRITERS);
    const days = Number.parseInt(String(formData.get("dueDays") ?? "7"), 10);
    await requestInfoAs(actor, caseId, String(formData.get("message") ?? ""), days);
  });
}
