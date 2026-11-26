"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import {
  scheduleHearingAs,
  rescheduleHearingAs,
  cancelHearingAs,
  adjournHearingAs,
  HearingClashError,
  type HearingMode,
} from "@/lib/commission/hearings";
import { updateReferralAs, REFERRAL_STATUSES, type ReferralStatus } from "@/lib/commission/referrals";

/** Officers and admins run the hearing calendar and the tribunal referral; commissioners act in their own portal. */
const OFFICERS = ["staff", "admin"] as const;

export type HearingState = {
  ok?: boolean;
  error?: string;
  clashes?: string[];
  at?: number;
  values?: Record<string, string | string[]>;
};

const KEYS: [string, string][] = [
  ["future", "past"],
  ["duration", "duration"],
  ["panel", "panel"],
  ["venue", "venue"],
  ["https", "link"],
  ["stage", "stage"],
  ["reason", "reason"],
  ["already has", "already_scheduled"],
  ["scheduled", "not_scheduled"],
  ["start time", "when"],
];

function fail(e: unknown, values?: HearingState["values"]): HearingState {
  if (e instanceof ForbiddenError) return { error: "forbidden", at: Date.now(), values };
  if (e instanceof HearingClashError) return { error: "clash", clashes: e.clashes, at: Date.now(), values };
  const m = e instanceof Error ? e.message : "";
  const hit = KEYS.find(([needle]) => m.includes(needle));
  if (!hit) console.error("hearing action failed", e);
  return { error: hit?.[1] ?? "invalid", at: Date.now(), values };
}

function ok(formData: FormData): HearingState {
  const path = String(formData.get("path") ?? "");
  if (path.startsWith("/")) revalidatePath(path);
  return { ok: true, at: Date.now() };
}

/** Schedules a hearing, or reschedules the case's scheduled one. A panel clash needs explicit confirmation. */
export async function scheduleHearingAction(_p: HearingState, formData: FormData): Promise<HearingState> {
  const values = {
    when: String(formData.get("when") ?? ""),
    duration: String(formData.get("duration") ?? "60"),
    mode: String(formData.get("mode") ?? "in_person"),
    venue: String(formData.get("venue") ?? ""),
    onlineLink: String(formData.get("onlineLink") ?? ""),
    panel: formData.getAll("panel").map(String),
  };
  try {
    const actor = await assertStaff(OFFICERS);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.when)) return { error: "when", at: Date.now(), values };
    const input = {
      startsAt: `${values.when}:00+03:00`, // the form is in Nairobi time
      durationMinutes: Number.parseInt(values.duration, 10),
      mode: (values.mode === "online" ? "online" : "in_person") as HearingMode,
      venue: values.venue,
      onlineLink: values.onlineLink,
      panel: values.panel,
      confirmClash: formData.get("confirmClash") === "1",
    };
    const hearingId = String(formData.get("hearingId") ?? "");
    if (hearingId) await rescheduleHearingAs(actor, hearingId, input);
    else await scheduleHearingAs(actor, String(formData.get("caseId") ?? ""), input);
    return ok(formData);
  } catch (e) {
    return fail(e, values);
  }
}

export async function endHearingAction(_p: HearingState, formData: FormData): Promise<HearingState> {
  const reason = String(formData.get("reason") ?? "");
  try {
    const actor = await assertStaff(OFFICERS);
    const hearingId = String(formData.get("hearingId") ?? "");
    if (formData.get("kind") === "cancel") await cancelHearingAs(actor, hearingId, reason);
    else await adjournHearingAs(actor, hearingId, reason);
    return ok(formData);
  } catch (e) {
    return fail(e, { reason });
  }
}

export async function updateReferralAction(_p: HearingState, formData: FormData): Promise<HearingState> {
  try {
    const actor = await assertStaff(OFFICERS);
    const status = String(formData.get("status") ?? "");
    if (!(REFERRAL_STATUSES as readonly string[]).includes(status)) return { error: "invalid", at: Date.now() };
    await updateReferralAs(actor, String(formData.get("referralId") ?? ""), {
      status: status as ReferralStatus,
      tribunalReference: String(formData.get("tribunalReference") ?? ""),
    });
    return ok(formData);
  } catch (e) {
    return fail(e);
  }
}
