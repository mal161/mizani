import { createAdminClient } from "@/lib/supabase/admin";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { csvCell, toCsv } from "@/lib/csv";
import { firstParam, type Period, type QueryValue } from "./period";

export interface Overview {
  filed: number;
  filedOnline: number;
  filedWalkIn: number;
  filedSw: number;
  closed: number;
  openNow: number;
  medianResolutionDays: number | null;
  deadlinesDue: number;
  deadlinesMet: number;
  decisions: number;
  outcomes: Record<string, number>;
  refundsKes: number;
}

export interface StageRow {
  stage: string;
  entered: number;
  medianDays: number | null;
  p90Days: number | null;
  openNow: number;
  overdueNow: number;
}

export interface OfficerRow {
  officerId: string;
  fullName: string | null;
  office: string | null;
  openNow: number;
  assignedInPeriod: number;
  closedInPeriod: number;
  medianResolutionDays: number | null;
  overdueNow: number;
}

export interface CategoryRow {
  month: string;
  category: string;
  filed: number;
}

export interface RepeatAdvocateRow {
  advocateId: string;
  fullName: string;
  admissionNo: string;
  complaints: number;
  openNow: number;
  upheld: number;
  referred: number;
  lastFiled: string;
}

export interface AnalyticsReport {
  period: Period;
  office: string | null;
  overview: Overview;
  stages: StageRow[];
  officers: OfficerRow[];
  categories: CategoryRow[];
  advocates: RepeatAdvocateRow[];
}

export const ANALYTICS_SECTIONS = ["overview", "stages", "officers", "categories", "advocates"] as const;
export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const int = (v: unknown): number => Number(v ?? 0);

/** Commissioners and admins only. Aggregates come from the analytics_* database functions. */
export async function analyticsAs(actor: StaffUser, period: Period, office: string | null): Promise<AnalyticsReport> {
  if (actor.role !== "commissioner" && actor.role !== "admin") throw new ForbiddenError();
  const admin = createAdminClient();
  const args = { p_from: period.from.toISOString(), p_to: period.to.toISOString(), p_office: office };
  const call = async (fn: string) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as unknown;
  };
  const [o, stages, officers, categories, advocates] = (await Promise.all([
    call("analytics_overview"),
    call("analytics_stage_times"),
    call("analytics_officers"),
    call("analytics_categories"),
    call("analytics_repeat_advocates"),
  ])) as [Raw, Raw[], Raw[], Raw[], Raw[]];

  return {
    period,
    office,
    overview: {
      filed: int(o.filed),
      filedOnline: int(o.filed_online),
      filedWalkIn: int(o.filed_walk_in),
      filedSw: int(o.filed_sw),
      closed: int(o.closed),
      openNow: int(o.open_now),
      medianResolutionDays: num(o.median_resolution_days),
      deadlinesDue: int(o.deadlines_due),
      deadlinesMet: int(o.deadlines_met),
      decisions: int(o.decisions),
      outcomes: Object.fromEntries(Object.entries((o.outcomes as Record<string, unknown>) ?? {}).map(([k, v]) => [k, int(v)])),
      refundsKes: int(o.refunds_kes),
    },
    stages: stages.map((r) => ({
      stage: String(r.stage),
      entered: int(r.entered),
      medianDays: num(r.median_days),
      p90Days: num(r.p90_days),
      openNow: int(r.open_now),
      overdueNow: int(r.overdue_now),
    })),
    officers: officers.map((r) => ({
      officerId: String(r.officer_id),
      fullName: (r.full_name as string | null) ?? null,
      office: (r.office as string | null) ?? null,
      openNow: int(r.open_now),
      assignedInPeriod: int(r.assigned_in_period),
      closedInPeriod: int(r.closed_in_period),
      medianResolutionDays: num(r.median_resolution_days),
      overdueNow: int(r.overdue_now),
    })),
    categories: categories.map((r) => ({ month: String(r.month), category: String(r.category), filed: int(r.filed) })),
    advocates: advocates.map((r) => ({
      advocateId: String(r.advocate_id),
      fullName: String(r.full_name),
      admissionNo: String(r.admission_no),
      complaints: int(r.complaints),
      openNow: int(r.open_now),
      upheld: int(r.upheld),
      referred: int(r.referred),
      lastFiled: String(r.last_filed),
    })),
  };
}

/** One section as CSV. The first line names the report; internal ids are never exported. */
export function analyticsCsv(r: AnalyticsReport, s: AnalyticsSection): string {
  const title = `# Mizani analytics: ${s}, ${r.period.fromDay} to ${r.period.toDay}, office: ${r.office ?? "all"}`;
  const o = r.overview;
  const table: [string[], unknown[][]] =
    s === "overview"
      ? [
          ["measure", "value"],
          [
            ["filed", o.filed],
            ["filed_online", o.filedOnline],
            ["filed_walk_in", o.filedWalkIn],
            ["filed_kiswahili", o.filedSw],
            ["closed", o.closed],
            ["open_now", o.openNow],
            ["median_resolution_days", o.medianResolutionDays],
            ["deadlines_due", o.deadlinesDue],
            ["deadlines_met_on_time", o.deadlinesMet],
            ["decisions", o.decisions],
            ...Object.entries(o.outcomes).map(([k, v]) => [`outcome_${k}`, v]),
            ["refunds_ordered_kes", o.refundsKes],
          ],
        ]
      : s === "stages"
        ? [
            ["stage", "entered", "median_days", "p90_days", "open_now", "overdue_now"],
            r.stages.map((x) => [x.stage, x.entered, x.medianDays, x.p90Days, x.openNow, x.overdueNow]),
          ]
        : s === "officers"
          ? [
              ["officer", "office", "open_now", "assigned_in_period", "closed_in_period", "median_resolution_days", "overdue_now"],
              r.officers.map((x) => [x.fullName, x.office, x.openNow, x.assignedInPeriod, x.closedInPeriod, x.medianResolutionDays, x.overdueNow]),
            ]
          : s === "categories"
            ? [["month", "category", "filed"], r.categories.map((x) => [x.month, x.category, x.filed])]
            : [
                ["advocate", "admission_no", "complaints", "open_now", "upheld", "referred", "last_filed"],
                r.advocates.map((x) => [x.fullName, x.admissionNo, x.complaints, x.openNow, x.upheld, x.referred, x.lastFiled]),
              ];
  return `${csvCell(title)}\r\n${toCsv(...table)}`;
}

/** Office filter from the URL: any non-empty name up to 80 characters (an office with no cases shows empty sections). */
export function officeParam(v: QueryValue): string | null {
  const o = firstParam(v)?.trim().slice(0, 80);
  return o ? o : null;
}

/** Offices of active staff, for the office filter. */
export async function officeOptions(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("office")
    .in("role", ["staff", "admin", "commissioner"])
    .eq("active", true)
    .not("office", "is", null);
  return [...new Set((data ?? []).map((p) => p.office as string))].sort();
}
