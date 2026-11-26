import { useTranslations } from "next-intl";
import { StatusForm } from "./StatusForm";

export default function StatusPage() {
  const t = useTranslations("status");
  return (
    <main className="mx-auto my-10 flex max-w-md flex-col gap-6 rounded-lg border bg-white px-6 py-8 sm:my-12 sm:px-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <StatusForm />
    </main>
  );
}
