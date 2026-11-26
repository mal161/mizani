import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { analyticsAs, officeOptions, officeParam, type AnalyticsSection } from "@/lib/analytics/analytics";
import { parsePeriod, periodQuery } from "@/lib/analytics/period";
import { isOutcome } from "@/lib/commission/outcomes";
import { logAudit } from "@/lib/audit";
import { StatTile } from "@/components/analytics/StatTile";
import { BarList } from "@/components/analytics/BarList";
import { MonthlyColumns } from "@/components/analytics/MonthlyColumns";
import { DataTable } from "@/components/analytics/DataTable";
import { Link, type Locale } from "@/i18n/routing";
import { Filters } from "./Filters";

type Search = { period?: string; from?: string; to?: string; office?: string };

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<Search> }) {
  const { locale } = await params;
  const user = await requireStaff(locale, COMMISSION_ROLES);
  const q = await searchParams;
  const period = parsePeriod(q);
  const office = officeParam(q.office);
  const [r, offices] = await Promise.all([analyticsAs(user, period, office), officeOptions()]);
  await logAudit({
    actorId: user.id,
    channel: "web",
    action: "view_analytics",
    entity: "analytics",
    entityId: "*",
    details: { period: periodQuery(period), office },
  });

  const t = await getTranslations("analytics");
  const tStages = await getTranslations("stages");
  const tCat = await getTranslations("categories");
  const tOut = await getTranslations("commission.outcomes");
  const format = await getFormatter();
  const n = (v: number) => format.number(v);
  const d1 = (v: number | null) => (v === null ? "—" : format.number(v, { maximumFractionDigits: 1 }));
  const dateOf = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "Africa/Nairobi" });
  const monthOf = (day: string) => format.dateTime(new Date(`${day}T12:00:00Z`), { month: "short", year: "2-digit", timeZone: "UTC" });
  const catName = (k: string) => (tCat.has(k) ? tCat(k) : k);
  const exportHref = (s: AnalyticsSection) => `/api/analytics/export?section=${s}&${periodQuery(period)}${office ? `&office=${encodeURIComponent(office)}` : ""}`;
  const o = r.overview;

  const section = (s: AnalyticsSection, title: string, empty: boolean, body: ReactNode) => (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <a href={exportHref(s)} data-testid={`export-${s}`} className="ml-auto text-sm underline">
          {t("csv")}
        </a>
      </div>
      {empty ? <p className="text-sm text-slate-500">{t("empty")}</p> : body}
    </section>
  );

  // Longest wait: most overdue now, then the longest median stay.
  const waiting = [...r.stages].sort((a, b) => b.overdueNow - a.overdueNow || (b.medianDays ?? -1) - (a.medianDays ?? -1))[0];
  const longest = waiting && (waiting.overdueNow > 0 || (waiting.medianDays ?? 0) > 0) ? waiting.stage : null;
  const stagesEmpty = r.stages.every((s) => s.entered === 0 && s.openNow === 0);

  const months = [...new Set(r.categories.map((c) => c.month))].sort();
  const cats = [...new Set(r.categories.map((c) => c.category))].sort();
  const cell = (m: string, c: string) => r.categories.find((x) => x.month === m && x.category === c)?.filed ?? 0;
  const outcomes = Object.entries(o.outcomes).filter(([k]) => isOutcome(k));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium">{t("title")}</h1>
        <p className="text-sm text-slate-600">
          {t("intro", {
            from: dateOf(period.from.toISOString()),
            to: dateOf(new Date(period.to.getTime() - 1).toISOString()),
            office: office ? t("officeNamed", { office }) : t("allOffices"),
          })}
        </p>
      </div>
      <Filters period={period.key} fromDay={period.fromDay} toDay={period.toDay} office={office} offices={offices} />

      {section(
        "overview",
        t("overview.title"),
        o.filed === 0 && o.openNow === 0 && o.closed === 0 && o.decisions === 0,
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile testId="stat-filed" label={t("overview.filed")} value={n(o.filed)} sub={t("overview.filedSplit", { online: o.filedOnline, walkIn: o.filedWalkIn, sw: o.filedSw })} />
          <StatTile testId="stat-closed" label={t("overview.closed")} value={n(o.closed)} />
          <StatTile testId="stat-open" label={t("overview.openNow")} value={n(o.openNow)} />
          <StatTile testId="stat-median" label={t("overview.median")} value={d1(o.medianResolutionDays)} />
          <StatTile
            testId="stat-deadlines"
            label={t("overview.deadlines")}
            value={o.deadlinesDue ? `${Math.round((100 * o.deadlinesMet) / o.deadlinesDue)}%` : "—"}
            sub={t("overview.deadlinesSub", { met: o.deadlinesMet, due: o.deadlinesDue })}
          />
          <StatTile testId="stat-decisions" label={t("overview.decisions")} value={n(o.decisions)} />
          <StatTile testId="stat-refunds" label={t("overview.refunds")} value={n(o.refundsKes)} />
        </div>,
      )}

      {section(
        "stages",
        t("stages.title"),
        stagesEmpty,
        <>
          <BarList
            label={t("stages.chart")}
            unit={t("stages.days")}
            format={(v) => format.number(v, { maximumFractionDigits: 1 })}
            items={r.stages.map((s) => ({ label: tStages(s.stage), value: s.medianDays, note: s.stage === longest ? t("stages.longest") : undefined }))}
          />
          <DataTable
            head={[t("stages.head.stage"), t("stages.head.entered"), t("stages.head.median"), t("stages.head.p90"), t("stages.head.open"), t("stages.head.overdue")]}
            rows={r.stages.map((s) => [tStages(s.stage), n(s.entered), d1(s.medianDays), d1(s.p90Days), n(s.openNow), n(s.overdueNow)])}
          />
        </>,
      )}

      {section(
        "categories",
        t("trends.title"),
        months.length === 0,
        <>
          <MonthlyColumns
            label={t("trends.chart")}
            months={months.map((m) => ({ month: m, label: monthOf(m), value: cats.reduce((sum, c) => sum + cell(m, c), 0) }))}
          />
          <DataTable
            head={[t("trends.head.month"), ...cats.map(catName), t("trends.head.total")]}
            rows={months.map((m) => [monthOf(m), ...cats.map((c) => n(cell(m, c))), n(cats.reduce((sum, c) => sum + cell(m, c), 0))])}
          />
        </>,
      )}

      {section(
        "officers",
        t("officers.title"),
        r.officers.length === 0,
        <DataTable
          caption={t("officers.caption")}
          head={[
            t("officers.head.officer"),
            t("officers.head.office"),
            t("officers.head.open"),
            t("officers.head.assigned"),
            t("officers.head.closed"),
            t("officers.head.median"),
            t("officers.head.overdue"),
          ]}
          rows={r.officers.map((x) => [x.fullName ?? "—", x.office ?? "—", n(x.openNow), n(x.assignedInPeriod), n(x.closedInPeriod), d1(x.medianResolutionDays), n(x.overdueNow)])}
        />,
      )}

      {section(
        "advocates",
        t("advocates.title"),
        r.advocates.length === 0,
        <DataTable
          caption={t("advocates.caption")}
          head={[
            t("advocates.head.advocate"),
            t("advocates.head.admission"),
            t("advocates.head.complaints"),
            t("advocates.head.open"),
            t("advocates.head.upheld"),
            t("advocates.head.referred"),
            t("advocates.head.last"),
          ]}
          rows={r.advocates.map((x) => [
            <Link key={x.advocateId} href={`/staff?tab=all&advocate=${x.advocateId}`} className="underline">
              {x.fullName}
            </Link>,
            x.admissionNo,
            n(x.complaints),
            n(x.openNow),
            n(x.upheld),
            n(x.referred),
            dateOf(x.lastFiled),
          ])}
        />,
      )}

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-medium">{t("outcomes.title")}</h2>
        {outcomes.length === 0 ? (
          <p className="text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <>
            <BarList label={t("outcomes.chart")} unit="" format={n} items={outcomes.map(([k, v]) => ({ label: tOut(k), value: v }))} />
            <DataTable head={[t("outcomes.head.outcome"), t("outcomes.head.count")]} rows={outcomes.map(([k, v]) => [tOut(k), n(v)])} />
          </>
        )}
      </section>
    </main>
  );
}
