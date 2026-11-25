import { getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import type { Locale } from "@/i18n/routing";
import { ComplaintForm } from "./ComplaintForm";

export default async function FileComplaintPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  await requireComplainant(locale);
  const t = await getTranslations("file");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <ComplaintForm />
    </main>
  );
}
