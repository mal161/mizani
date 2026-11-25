import { getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import type { Locale } from "@/i18n/routing";

export default async function MyCasesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  await requireComplainant(locale);
  const t = await getTranslations("myCases");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
    </main>
  );
}
