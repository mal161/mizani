import { getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import type { Locale } from "@/i18n/routing";
import { ComplaintForm } from "./ComplaintForm";

export default async function FileComplaintPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  await requireComplainant(locale);
  const t = await getTranslations("file");
  return (
    <main className="mx-auto my-10 flex max-w-2xl flex-col gap-6 rounded-lg border bg-white px-6 py-8 sm:my-12 sm:px-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      <ComplaintForm />
    </main>
  );
}
