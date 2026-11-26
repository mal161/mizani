import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { CaseStamp } from "@/components/case/CaseStamp";
import { StageTrack } from "@/components/case/StageTrack";

export default function HomePage() {
  const t = useTranslations("home");
  const tStages = useTranslations("stages");
  const tTrack = useTranslations("caseTrack");
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <BrandMark className="h-6 w-6 text-accent" />
          <span className="text-lg font-medium">Mizani</span>
          <span className="hidden text-sm text-slate-600 sm:inline">· {t("org")}</span>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1fr_440px] lg:gap-16 lg:py-16">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl leading-tight font-medium text-slate-900 lg:text-5xl lg:leading-[1.08]">{t("headline")}</h1>
          <p className="max-w-xl text-lg leading-7 text-slate-600">{t("tagline")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/my/file" className="rounded-md bg-accent px-5 py-3 text-white transition-colors hover:bg-accent-hover">
              {t("fileComplaint")}
            </Link>
            <Link href="/status" className="rounded-md border border-slate-300 bg-white px-5 py-3 transition-colors hover:bg-slate-100">
              {t("trackCase")}
            </Link>
          </div>
          <p className="text-sm text-slate-600">
            {t("advocatePrompt")}{" "}
            <Link href="/advocate/activate" className="text-accent underline">
              {t("advocateActivate")}
            </Link>
          </p>
        </div>

        {/* Product preview with synthetic data: what a complainant sees when they follow a case. */}
        <figure className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <CaseStamp number="ACC/2026/000231" />
            <span className="text-xs text-slate-500">{t("preview.label")}</span>
          </div>
          <p className="text-base font-medium text-slate-900">{t("preview.summary")}</p>
          <StageTrack vertical current="investigation" title={tTrack("title")} nowLabel={tTrack("now")} label={(s) => tStages(s)} />
          <p className="border-t pt-4 text-sm text-slate-600">{t("preview.update")}</p>
          <figcaption className="text-xs leading-5 text-slate-500">{t("preview.note")}</figcaption>
        </figure>
      </main>
    </div>
  );
}
