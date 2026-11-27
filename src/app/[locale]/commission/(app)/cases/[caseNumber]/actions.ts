"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { recordHearingMinutesAs } from "@/lib/commission/hearings";
import { recordDecisionAs } from "@/lib/commission/decisions";
import { isOutcome } from "@/lib/commission/outcomes";

export type CommissionState = { ok?: boolean; error?: string; at?: number; values?: Record<string, string | string[]> };

/** Maps service validation messages to message-catalogue keys. */
function errorKey(e: unknown): string {
  if (e instanceof ForbiddenError) return "forbidden";
  const m = e instanceof Error ? e.message : "";
  if (m.includes("must be held")) return "held";
  if (m.includes("on the panel") || m.includes("on the hearing panel")) return "not_on_panel";
  if (m.includes("adjourned")) return "adjourned";
  if (m.includes("not started")) return "not_started";
  for (const k of ["amount", "reasons", "panel", "stage", "minutes", "cancelled"]) if (m.includes(k)) return k;
  console.error("commission action failed", e);
  return "invalid";
}

function done(path: string): CommissionState {
  if (path.startsWith("/")) revalidatePath(path);
  return { ok: true, at: Date.now() };
}

export async function recordMinutesAction(_p: CommissionState, formData: FormData): Promise<CommissionState> {
  const minutes = String(formData.get("minutes") ?? "");
  try {
    const actor = await assertStaff(COMMISSION_ROLES);
    await recordHearingMinutesAs(actor, String(formData.get("hearingId") ?? ""), minutes);
    return done(String(formData.get("path") ?? ""));
  } catch (e) {
    return { error: errorKey(e), at: Date.now(), values: { minutes } };
  }
}

export async function recordDecisionAction(_p: CommissionState, formData: FormData): Promise<CommissionState> {
  const values = {
    outcome: String(formData.get("outcome") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    reasons: String(formData.get("reasons") ?? ""),
    orders: String(formData.get("orders") ?? ""),
    panel: formData.getAll("panel").map(String),
  };
  try {
    const actor = await assertStaff(COMMISSION_ROLES);
    if (!isOutcome(values.outcome)) return { error: "invalid", at: Date.now(), values };
    const amount = values.amount.replace(/[,\s]/g, "");
    await recordDecisionAs(actor, String(formData.get("caseId") ?? ""), {
      outcome: values.outcome,
      reasons: values.reasons,
      orders: values.orders,
      amountKes: amount ? Number(amount) : undefined,
      panel: values.panel,
    });
    return done(String(formData.get("path") ?? ""));
  } catch (e) {
    return { error: errorKey(e), at: Date.now(), values };
  }
}
