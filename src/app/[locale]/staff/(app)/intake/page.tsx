import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import type { Locale } from "@/i18n/routing";
import { IntakeForm } from "./IntakeForm";

export default async function IntakePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  await requireStaff(locale, ["staff", "admin"]);
  const t = await getTranslations("intake");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="no-print text-2xl font-bold">{t("title")}</h1>
      <p className="no-print text-slate-600">{t("intro")}</p>
      <IntakeForm statusUrl={`${proto}://${host}/${locale}/status`} />
    </main>
  );
}
