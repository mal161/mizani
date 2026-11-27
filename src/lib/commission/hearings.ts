import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { getSmsProvider } from "@/lib/sms";
import { ForbiddenError, actorId, type StaffUser } from "@/lib/auth/staff-types";
import { openStageDeadline } from "@/lib/cases/deadlines";
import { smsText } from "@/lib/cases/messages";
import type { Locale } from "@/i18n/routing";
import { newHearingRoom } from "./video";

export type HearingMode = "in_person" | "online";

export interface HearingInput {
  startsAt: string; // ISO 8601 with offset
  durationMinutes: number;
  mode: HearingMode;
  venue?: string;
  /** Optional: an online hearing without one gets a video room (see video.ts). */
  onlineLink?: string;
  panel: string[];
  /** Schedule anyway when a panel member already has an overlapping hearing. */
  confirmClash?: boolean;
}

export class HearingClashError extends Error {
  constructor(public clashes: string[]) {
    super(`panel member already booked: ${clashes.join(", ")}`);
    this.name = "HearingClashError";
  }
}

const SCHEDULABLE_FROM = ["investigation", "conciliation", "hearing"];
const isOfficer = (a: StaffUser) => a.role === "staff" || a.role === "admin";

/** "2026-12-05 10:00" in Africa/Nairobi. */
export function nairobiWhen(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

async function validate(input: HearingInput): Promise<{ startsAt: string; venue: string | null; link: string | null; panel: string[] }> {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("invalid start time");
  if (start.getTime() <= Date.now()) throw new Error("hearing must be in the future");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480) {
    throw new Error("duration must be 15-480 minutes");
  }
  const panel = [...new Set(input.panel)];
  if (panel.length < 1 || panel.length > 5) throw new Error("panel must have 1-5 members");
  const { data: members } = await createAdminClient()
    .from("profiles")
    .select("id")
    .in("id", panel)
    .in("role", ["commissioner", "admin"])
    .eq("active", true);
  if ((members ?? []).length !== panel.length) throw new Error("every panel member must be an active commissioner");
  const venue = input.venue?.trim() || null;
  // A pasted link is kept as typed; an online hearing without one gets its own video room.
  const link = input.onlineLink?.trim() || (input.mode === "online" ? newHearingRoom() : null);
  if (input.mode === "in_person" && !venue) throw new Error("venue required for an in-person hearing");
  if (input.mode === "online" && !(link && /^https:\/\/\S+$/.test(link))) throw new Error("online hearings need an https link");
  return { startsAt: start.toISOString(), venue: input.mode === "in_person" ? venue : null, link: input.mode === "online" ? link : null, panel };
}

/** Case numbers of scheduled hearings that share a panel member and overlap this slot. */
async function findClashes(panel: string[], startsAt: string, minutes: number, ignoreHearingId?: string): Promise<string[]> {
  const start = new Date(startsAt).getTime();
  const end = start + minutes * 60_000;
  const { data } = await createAdminClient()
    .from("hearings")
    .select("id,starts_at,duration_minutes,cases(case_number)")
    .eq("status", "scheduled")
    .overlaps("panel", panel);
  return (data ?? [])
    .filter((h) => h.id !== ignoreHearingId)
    .filter((h) => {
      const s = new Date(h.starts_at).getTime();
      return s < end && start < s + h.duration_minutes * 60_000;
    })
    .map((h) => (h.cases as unknown as { case_number: string }).case_number);
}

async function caseContext(caseId: string) {
  const { data, error } = await createAdminClient()
    .from("cases")
    .select("id,case_number,stage,language,advocate_notified_at,complainant:profiles!cases_complainant_id_fkey(phone),advocates(phone)")
    .eq("id", caseId)
    .single();
  if (error) throw new Error(`load case: ${error.message}`);
  return {
    caseNumber: data.case_number as string,
    stage: data.stage as string,
    language: data.language as Locale,
    notified: Boolean(data.advocate_notified_at),
    complainantPhone: (data.complainant as unknown as { phone: string | null } | null)?.phone ?? null,
    advocatePhone: data.advocate_notified_at ? ((data.advocates as unknown as { phone: string | null } | null)?.phone ?? null) : null,
  };
}

async function textParties(ctx: Awaited<ReturnType<typeof caseContext>>, message: (l: Locale) => string) {
  const sms = getSmsProvider();
  const sends: Promise<unknown>[] = [];
  if (ctx.complainantPhone) sends.push(sms.send(ctx.complainantPhone, message(ctx.language)));
  if (ctx.advocatePhone) sends.push(sms.send(ctx.advocatePhone, message("en")));
  await Promise.allSettled(sends);
}

async function event(caseId: string, actor: StaffUser, type: string, notified: boolean, body: object, visibility: "parties" | "internal" = "parties") {
  const { error } = await createAdminClient()
    .from("case_events")
    .insert({ case_id: caseId, type, visibility, advocate_visible: visibility === "parties" && notified, actor_id: actorId(actor), body });
  if (error) throw new Error(`${type} event: ${error.message}`);
}

/**
 * Officers schedule a hearing: validates the panel and slot, warns about panel clashes, moves the case to
 * "hearing" (one notice to the parties, not two), notifies the panel, and texts both parties.
 */
export async function scheduleHearingAs(actor: StaffUser, caseId: string, input: HearingInput): Promise<{ hearingId: string; clashes: string[] }> {
  if (!isOfficer(actor)) throw new ForbiddenError();
  const v = await validate(input);
  const ctx = await caseContext(caseId);
  if (!SCHEDULABLE_FROM.includes(ctx.stage)) throw new Error(`cannot schedule a hearing at stage ${ctx.stage}`);
  const clashes = await findClashes(v.panel, v.startsAt, input.durationMinutes);
  if (clashes.length && !input.confirmClash) throw new HearingClashError(clashes);

  const admin = createAdminClient();
  const { data: h, error } = await admin
    .from("hearings")
    .insert({
      case_id: caseId,
      starts_at: v.startsAt,
      duration_minutes: input.durationMinutes,
      mode: input.mode,
      venue: v.venue,
      online_link: v.link,
      panel: v.panel,
      created_by: actorId(actor),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("this case already has a scheduled hearing");
    throw new Error(`schedule hearing: ${error.message}`);
  }

  if (ctx.stage !== "hearing") {
    const { data: moved } = await admin.rpc("transition_case_stage", {
      p_case_id: caseId,
      p_from: ctx.stage,
      p_to: "hearing",
      p_actor: actorId(actor),
      p_reason: null,
    });
    if (moved) await openStageDeadline(caseId, "hearing");
  }
  await event(caseId, actor, "hearing_scheduled", ctx.notified, { starts_at: v.startsAt, mode: input.mode, venue: v.venue, duration_minutes: input.durationMinutes });
  await admin.from("notifications").insert(v.panel.map((user_id) => ({ user_id, case_id: caseId, kind: "hearing_scheduled" })));
  await textParties(ctx, (l) => smsText.hearingScheduled(l, ctx.caseNumber, nairobiWhen(v.startsAt), v.venue));
  await logAudit({
    actorId: actorId(actor),
    channel: "web",
    action: "schedule_hearing",
    entity: "cases",
    entityId: caseId,
    details: { hearing_id: h.id, starts_at: v.startsAt, mode: input.mode, panel: v.panel, clashes },
  });
  return { hearingId: h.id as string, clashes };
}

async function loadScheduled(hearingId: string) {
  const { data } = await createAdminClient().from("hearings").select("id,case_id,status,panel,duration_minutes,starts_at").eq("id", hearingId).maybeSingle();
  if (!data) throw new Error("hearing not found");
  return data as { id: string; case_id: string; status: string; panel: string[]; duration_minutes: number; starts_at: string };
}

export async function rescheduleHearingAs(actor: StaffUser, hearingId: string, input: HearingInput): Promise<{ clashes: string[] }> {
  if (!isOfficer(actor)) throw new ForbiddenError();
  const h = await loadScheduled(hearingId);
  if (h.status !== "scheduled") throw new Error("only a scheduled hearing can be rescheduled");
  const v = await validate(input);
  const clashes = await findClashes(v.panel, v.startsAt, input.durationMinutes, hearingId);
  if (clashes.length && !input.confirmClash) throw new HearingClashError(clashes);
  const { error } = await createAdminClient()
    .from("hearings")
    .update({ starts_at: v.startsAt, duration_minutes: input.durationMinutes, mode: input.mode, venue: v.venue, online_link: v.link, panel: v.panel })
    .eq("id", hearingId);
  if (error) throw new Error(`reschedule: ${error.message}`);
  const ctx = await caseContext(h.case_id);
  await event(h.case_id, actor, "hearing_changed", ctx.notified, { change: "rescheduled", starts_at: v.startsAt, mode: input.mode, venue: v.venue });
  await textParties(ctx, (l) => smsText.hearingScheduled(l, ctx.caseNumber, nairobiWhen(v.startsAt), v.venue));
  await logAudit({ actorId: actorId(actor), channel: "web", action: "reschedule_hearing", entity: "cases", entityId: h.case_id, details: { hearing_id: hearingId, starts_at: v.startsAt, clashes } });
  return { clashes };
}

async function endHearing(actor: StaffUser, hearingId: string, status: "cancelled" | "adjourned", reason: string) {
  if (!isOfficer(actor)) throw new ForbiddenError();
  const why = reason.trim();
  if (why.length < 3) throw new Error("a reason is required");
  const h = await loadScheduled(hearingId);
  if (h.status !== "scheduled") throw new Error("only a scheduled hearing can be changed");
  const { error } = await createAdminClient().from("hearings").update({ status }).eq("id", hearingId);
  if (error) throw new Error(`${status}: ${error.message}`);
  const ctx = await caseContext(h.case_id);
  await event(h.case_id, actor, "hearing_changed", ctx.notified, { change: status, reason: why });
  await textParties(ctx, (l) => smsText.hearingChanged(l, ctx.caseNumber, status === "cancelled" ? (l === "sw" ? "umefutwa" : "cancelled") : l === "sw" ? "umeahirishwa" : "adjourned"));
  await logAudit({ actorId: actorId(actor), channel: "web", action: `${status === "cancelled" ? "cancel" : "adjourn"}_hearing`, entity: "cases", entityId: h.case_id, details: { hearing_id: hearingId, reason: why } });
}

export const cancelHearingAs = (actor: StaffUser, hearingId: string, reason: string) => endHearing(actor, hearingId, "cancelled", reason);
export const adjournHearingAs = (actor: StaffUser, hearingId: string, reason: string) => endHearing(actor, hearingId, "adjourned", reason);

/** A commissioner on the panel (or an admin) records the minutes; the hearing becomes "held". Minutes are internal. */
export async function recordHearingMinutesAs(actor: StaffUser, hearingId: string, minutes: string): Promise<void> {
  if (actor.role !== "commissioner" && actor.role !== "admin") throw new ForbiddenError();
  const h = await loadScheduled(hearingId);
  if (actor.role === "commissioner" && !h.panel.includes(actor.id)) throw new Error("only a commissioner on the panel can record minutes");
  if (h.status === "cancelled") throw new Error("the hearing was cancelled");
  if (h.status === "adjourned") throw new Error("the hearing was adjourned");
  if (new Date(h.starts_at).getTime() > Date.now()) throw new Error("the hearing has not started yet");
  const text = minutes.trim();
  if (text.length < 10 || text.length > 50000) throw new Error("minutes must be 10-50000 characters");
  // Guarded on status so a cancel or adjournment at the same moment is not overwritten.
  const { data: saved, error } = await createAdminClient()
    .from("hearings")
    .update({ minutes: text, status: "held" })
    .eq("id", hearingId)
    .in("status", ["scheduled", "held"])
    .select("id");
  if (error) throw new Error(`record minutes: ${error.message}`);
  if (!saved?.length) throw new Error("the hearing was cancelled or adjourned meanwhile");
  const ctx = await caseContext(h.case_id);
  await event(h.case_id, actor, "hearing_held", ctx.notified, {});
  await logAudit({ actorId: actorId(actor), channel: "web", action: "record_minutes", entity: "cases", entityId: h.case_id, details: { hearing_id: hearingId } });
}

export interface HearingRow {
  id: string;
  case_id: string;
  starts_at: string;
  duration_minutes: number;
  mode: HearingMode;
  venue: string | null;
  online_link: string | null;
  panel: string[];
  status: string;
  minutes: string | null;
  case_number?: string;
}

export async function caseHearings(caseId: string): Promise<HearingRow[]> {
  const { data } = await createAdminClient().from("hearings").select("*").eq("case_id", caseId).order("starts_at", { ascending: false });
  return (data ?? []) as HearingRow[];
}

export async function hearingsBetween(from: Date, to: Date, commissionerId?: string): Promise<HearingRow[]> {
  let q = createAdminClient()
    .from("hearings")
    .select("*,cases(case_number)")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .neq("status", "cancelled")
    .order("starts_at");
  if (commissionerId) q = q.contains("panel", [commissionerId]);
  const { data } = await q;
  return (data ?? []).map((h) => ({ ...(h as HearingRow), case_number: (h.cases as unknown as { case_number: string }).case_number }));
}
