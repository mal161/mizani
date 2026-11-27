import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { PublicShell } from "@/components/shell/PublicShell";
import Image from "next/image";
import { StageTrack } from "@/components/case/StageTrack";
import { CaseFileCard } from "@/components/home/CaseFileCard";

/**
 * The four service tiles take the Kenyan flag's colours in its order (black, white, red, green). White text on the
 * flag red (6.4:1) and green (7.2:1) passes; the white tile uses navy text. Hover darkens each tile and its crescent.
 */
const FLAG_TILES = [
  { tile: "bg-flag-black hover:bg-[#1f1f1f]", bulge: "bg-flag-black group-hover:bg-[#1f1f1f]", title: "text-white", text: "text-white/85" },
  { tile: "bg-white hover:bg-primary-soft", bulge: "bg-white group-hover:bg-primary-soft", title: "text-primary", text: "text-slate-600" },
  { tile: "bg-flag-red hover:bg-[#9e0000]", bulge: "bg-flag-red group-hover:bg-[#9e0000]", title: "text-white", text: "text-white/90" },
  { tile: "bg-flag-green hover:bg-[#005400]", bulge: "bg-flag-green group-hover:bg-[#005400]", title: "text-white", text: "text-white/90" },
] as const;

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
      <section className="relative isolate overflow-hidden bg-primary text-white">
        {/* Hero image: full-bleed behind the text on phones, the right side from lg (shown near its native 736px). */}
        <div aria-hidden className="absolute inset-y-0 right-0 -z-10 w-full lg:w-1/2 xl:w-[58%]">
          <Image src="/images/hero-scales.jpg" alt="" fill priority sizes="(min-width: 1280px) 58vw, (min-width: 1024px) 50vw, 100vw" className="object-cover object-center" />
          {/* Phones: navy wash so white text stays readable. From lg: navy fades into the image from the text side. */}
          <div className="absolute inset-0 bg-primary/85 lg:bg-transparent lg:bg-[linear-gradient(to_right,var(--color-primary)_0%,rgb(27_42_74/0.6)_30%,rgb(27_42_74/0)_60%)]" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-20 sm:px-6 lg:min-h-[480px] lg:grid-cols-2 lg:pt-16 lg:pb-24">
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
        </div>
      </section>

      <section aria-labelledby="services" className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
        <h2 id="services" className="sr-only">
          {t("services")}
        </h2>
        {/* Kenyan flag colours in the flag's order, each edge a crescent with a white rim (the flag's white bands):
            stacked on phones the crescent runs along the bottom; in one row (lg) along the right. The 2x2 grid in
            between keeps straight edges with thin white separators. */}
        <ul className="grid overflow-hidden rounded-lg bg-white shadow-[0_8px_24px_rgb(15_23_42/0.12)] sm:grid-cols-2 sm:gap-[3px] lg:grid-cols-4 lg:gap-0">
          {services.map((s, i) => {
            const tone = FLAG_TILES[i];
            const last = i === services.length - 1;
            return (
              <li key={s.href} className="group relative" style={{ zIndex: services.length - i }}>
                <Link href={s.href} className={`flex h-full flex-col gap-2 p-6 ${i > 0 ? "pt-10 sm:pt-6 lg:pl-12" : ""} ${tone.tile}`}>
                  <span className={`text-base font-medium group-hover:underline ${tone.title}`}>{s.title}</span>
                  <span className={`text-sm leading-6 ${tone.text}`}>{s.text}</span>
                </Link>
                {!last && (
                  <>
                    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-6 overflow-hidden sm:hidden">
                      <span className={`absolute -top-6 -left-[10%] h-12 w-[120%] rounded-[50%] shadow-[0_0_0_3px_#fff] ${tone.bulge}`} />
                    </span>
                    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-full hidden w-7 overflow-hidden lg:block">
                      <span className={`absolute -top-[10%] -left-7 h-[120%] w-14 rounded-[50%] shadow-[0_0_0_3px_#fff] ${tone.bulge}`} />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* One case file per complaint: what the system keeps, with an example docket. */}
      <section aria-labelledby="case-file" className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-20 pb-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <h2 id="case-file" className="max-w-[16ch] text-4xl leading-tight font-bold text-primary sm:text-5xl sm:leading-[1.1]">
            {t("file.title")}
          </h2>
          <p className="max-w-xl text-lg leading-8 text-slate-700">{t("file.text")}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/status" className="rounded-md bg-primary px-6 py-3 text-base font-medium text-white hover:bg-primary-hover">
              {t("trackCase")}
            </Link>
            <Link href="/my/file" className="py-3 text-base font-medium text-primary underline underline-offset-4 hover:text-primary-hover">
              {t("fileComplaint")}
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <li>{t("file.fact1")}</li>
            <li>{t("file.fact2")}</li>
            <li>{t("file.fact3")}</li>
          </ul>
        </div>
        <CaseFileCard />
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
