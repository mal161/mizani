import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link } from "@/i18n/routing";
import { ActivateForm } from "./ActivateForm";

export default function ActivatePage() {
  const t = useTranslations("advocatePortal.activate");
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="text-2xl font-medium">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <ActivateForm />
      <p className="text-sm text-slate-600">
        {t("already")}{" "}
        <Link href="/login" className="underline">
          {t("signIn")}
        </Link>
      </p>
    </main>
  );
}
