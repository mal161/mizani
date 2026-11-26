import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StatusForm } from "./StatusForm";

export default function StatusPage() {
  const t = useTranslations("status");
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="text-2xl font-medium">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <StatusForm />
    </main>
  );
}
