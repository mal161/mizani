import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-slate-600">{t("tagline")}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/my/file"
          className="rounded-md bg-slate-900 px-4 py-2 text-white"
        >
          {t("fileComplaint")}
        </Link>
        <Link href="/status" className="rounded-md border px-4 py-2">
          {t("trackCase")}
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        {t("advocatePrompt")}{" "}
        <Link href="/advocate/activate" className="underline">
          {t("advocateActivate")}
        </Link>
      </p>
    </main>
  );
}
