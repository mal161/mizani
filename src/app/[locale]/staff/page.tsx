import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import type { Locale } from "@/i18n/routing";

export default async function StaffHomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const t = await getTranslations("staffHome");
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
    </main>
  );
}
