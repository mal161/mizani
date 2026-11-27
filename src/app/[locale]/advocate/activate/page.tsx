import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ActivateForm } from "./ActivateForm";

export default function ActivatePage() {
  const t = useTranslations("advocatePortal.activate");
  return (
    <main className="mx-auto my-10 flex max-w-md flex-col gap-6 rounded-lg border bg-white px-6 py-8 sm:my-12 sm:px-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
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
