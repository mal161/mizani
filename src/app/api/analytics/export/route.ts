import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { ANALYTICS_SECTIONS, analyticsAs, analyticsCsv, officeParam, type AnalyticsSection } from "@/lib/analytics/analytics";
import { parsePeriod, periodQuery } from "@/lib/analytics/period";
import { logAudit } from "@/lib/audit";

/** One analytics section as CSV (commissioners and admins). Audited. */
export async function GET(req: Request) {
  let actor;
  try {
    actor = await assertStaff(COMMISSION_ROLES);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const q = Object.fromEntries(new URL(req.url).searchParams);
  const section = q.section as AnalyticsSection;
  if (!(ANALYTICS_SECTIONS as readonly string[]).includes(section)) return new Response("Unknown section", { status: 400 });
  const period = parsePeriod(q);
  const office = officeParam(q.office);
  const report = await analyticsAs(actor, period, office);
  await logAudit({
    actorId: actor.id,
    channel: "web",
    action: "export_analytics",
    entity: "analytics",
    entityId: "*",
    details: { section, period: periodQuery(period), office },
  });
  return new Response(analyticsCsv(report, section), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mizani-${section}-${period.fromDay}-${period.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
