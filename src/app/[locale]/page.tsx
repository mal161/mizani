import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { PublicShell } from "@/components/shell/PublicShell";
import { Logo } from "@/components/brand/Logo";
import { StageTrack } from "@/components/case/StageTrack";

/**
 * Public home (DESIGN.md): navy hero with the Commission's name and one primary action, the full logo beside it;
 * a task row (eCitizen-style), how a complaint moves, and how to complain without internet.
 */
export default async function HomePage() {
  const t = await getTranslations("home");
  const ts = await getTranslations("shell");
  const tStages = await getTranslations("stages");
  const tTrack = await getTranslations("caseTrack");

  const services = [
    { href: "/my/file", title: ts("nav.file"), text: t("service.file") },
    { href: "/status", title: ts("nav.track"), text: t("service.track") },
    { href: "/login", title: ts("nav.myCases"), text: t("service.mine") },
    { href: "/advocate/activate", title: ts("nav.advocates"), text: t("service.advocate") },
  ];

  return (
    <PublicShell>
      <section className="bg-primary text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-16 lg:pb-24">
          <div className="flex flex-col gap-6">
            <p className="text-base text-slate-300">{ts("org")}</p>
            <h1 className="max-w-[18ch] text-4xl leading-tight font-bold sm:text-5xl sm:leading-[1.1]">{t("headline")}</h1>
            <p className="max-w-xl text-lg leading-7 text-slate-200">{t("tagline")}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/my/file" className="rounded-md bg-white px-6 py-3 text-base font-medium text-primary hover:bg-slate-100">
                {t("fileComplaint")}
              </Link>
              <Link href="/status" className="py-3 text-base font-medium text-white underline underline-offset-4 hover:text-slate-200">
                {t("trackCase")}
              </Link>
            </div>
          </div>
          <Logo
            tone="light"
            className="mx-auto hidden w-full max-w-xl lg:block"
            labels={{ advocate: ts("logo.advocate"), complainant: ts("logo.complainant"), tagline: ts("tagline") }}
          />
        </div>
      </section>

      <section aria-labelledby="services" className="mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
        <h2 id="services" className="sr-only">
          {t("services")}
        </h2>
        <ul className="grid overflow-hidden rounded-lg border bg-white shadow-[0_8px_24px_rgb(15_23_42/0.08)] sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <li key={s.href} className={`border-slate-200 ${i > 0 ? "border-t sm:border-t-0" : ""} ${i % 2 === 1 ? "sm:border-l" : ""} ${i > 1 ? "sm:border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}>
              <Link href={s.href} className="group flex h-full flex-col gap-2 p-6 hover:bg-primary-soft">
                <span className="text-base font-medium text-primary group-hover:underline">{s.title}</span>
                <span className="text-sm leading-6 text-slate-600">{s.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-bold text-primary">{t("process")}</h2>
          <p className="text-base leading-7 text-slate-600">{t("processIntro")}</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <StageTrack current={null} title={t("process")} nowLabel={tTrack("now")} label={(s) => tStages(s)} />
        </div>
      </section>

      <section className="border-t bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-[5fr_7fr] md:items-start">
          <h2 className="text-xl font-bold text-primary">{t("channelsTitle")}</h2>
          <p className="max-w-[65ch] text-base leading-7 text-slate-700">{t("channels")}</p>
        </div>
      </section>
    </PublicShell>
  );
}
