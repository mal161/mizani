import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { hearingsBetween } from "@/lib/commission/hearings";
import { nairobiDay, panelMembers, weekStart } from "@/lib/commission/portal";
import { caseSlug } from "@/lib/cases/case-number";
import { Link, type Locale } from "@/i18n/routing";

const DAY = 86400_000;

/** Week-by-week agenda of every panel's hearings; the viewer's own are highlighted. */
export default async function HearingsAgenda({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale } = await params;
  const user = await requireStaff(locale, COMMISSION_ROLES);
  const start = weekStart((await searchParams).week);
  const end = new Date(start.getTime() + 7 * DAY);
  const [rows, members] = await Promise.all([hearingsBetween(start, end), panelMembers()]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const t = await getTranslations("commission");
  const format = await getFormatter();

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
  const prev = nairobiDay(new Date(start.getTime() - 7 * DAY));
  const next = nairobiDay(end);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-medium">{t("agenda.title")}</h1>
        <span className="text-slate-600">
          {format.dateTime(start, { dateStyle: "medium", timeZone: "Africa/Nairobi" })} –{" "}
          {format.dateTime(new Date(end.getTime() - DAY), { dateStyle: "medium", timeZone: "Africa/Nairobi" })}
        </span>
        <nav className="ml-auto flex gap-3 text-sm">
          <Link href={`/commission/hearings?week=${prev}`} className="underline">
            ← {t("agenda.previous")}
          </Link>
          <Link href="/commission/hearings" className="underline">
            {t("agenda.thisWeek")}
          </Link>
          <Link href={`/commission/hearings?week=${next}`} className="underline">
            {t("agenda.next")} →
          </Link>
        </nav>
      </div>

      <ol className="flex flex-col gap-4">
        {days.map((d) => {
          const key = nairobiDay(d);
          const today = rows.filter((h) => nairobiDay(new Date(h.starts_at)) === key);
          return (
            <li key={key} className="flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="font-medium">{format.dateTime(d, { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" })}</h2>
              {today.length === 0 ? (
                <p className="text-sm text-slate-400">{t("agenda.none")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {today.map((h) => {
                    const mine = h.panel.includes(user.id);
                    return (
                      <li key={h.id} data-mine={mine} className={`rounded-md px-3 py-2 ${mine ? "border-l-4 border-emerald-700 bg-emerald-50" : "bg-slate-50"}`}>
                        <span className="mr-3 font-medium">
                          {format.dateTime(new Date(h.starts_at), { timeStyle: "short", timeZone: "Africa/Nairobi" })}
                        </span>
                        <Link href={`/commission/cases/${caseSlug(h.case_number!)}`} className="font-mono underline">
                          {h.case_number}
                        </Link>
                        <span className="text-slate-600">
                          {" · "}
                          {h.mode === "online" ? t("hearing.online") : (h.venue ?? "")}
                          {" · "}
                          {t(`hearing.status.${h.status}`)}
                          {" · "}
                          {h.panel.map((p) => names.get(p) ?? "—").join(", ")}
                        </span>
                        {mine && <span className="ml-2 rounded border border-accent/40 px-1.5 text-xs text-accent">{t("agenda.yourPanel")}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
