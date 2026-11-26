import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { awaitingDecision, recentlyDecided, upcomingHearings } from "@/lib/commission/portal";
import { caseSlug } from "@/lib/cases/case-number";
import { Link, type Locale } from "@/i18n/routing";

const card = "flex flex-col gap-3 rounded-lg border p-4";

export default async function CommissionHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const user = await requireStaff(locale, COMMISSION_ROLES);
  const [upcoming, awaiting, decided] = await Promise.all([upcomingHearings(user), awaitingDecision(user), recentlyDecided(user)]);
  const t = await getTranslations("commission");
  const format = await getFormatter();
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
  const caseLink = (n: string) => (
    <Link href={`/commission/cases/${caseSlug(n)}`} className="font-mono font-medium underline">
      {n}
    </Link>
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("home.title")}</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className={card} data-testid="upcoming-hearings">
          <h2 className="text-lg font-semibold">{t("home.upcoming")}</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">{t("home.noUpcoming")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {upcoming.map((h) => (
                <li key={h.id} className="flex flex-col">
                  {caseLink(h.case_number!)}
                  <span className="text-slate-600">
                    {when(h.starts_at)} · {h.mode === "online" ? t("hearing.online") : (h.venue ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card} data-testid="awaiting-decision">
          <h2 className="text-lg font-semibold">{t("home.awaiting")}</h2>
          {awaiting.length === 0 ? (
            <p className="text-sm text-slate-500">{t("home.noAwaiting")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {awaiting.map((a) => (
                <li key={a.case_id} className="flex flex-col">
                  {caseLink(a.case_number)}
                  <span className="text-slate-600">{a.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card} data-testid="recently-decided">
          <h2 className="text-lg font-semibold">{t("home.decided")}</h2>
          {decided.length === 0 ? (
            <p className="text-sm text-slate-500">{t("home.noDecided")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {decided.map((d) => (
                <li key={d.id} className="flex flex-col">
                  {caseLink(d.case_number)}
                  <span className="text-slate-600">
                    {t(`outcomes.${d.outcome}`)} · {format.dateTime(new Date(d.decided_at), { dateStyle: "medium", timeZone: "Africa/Nairobi" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
