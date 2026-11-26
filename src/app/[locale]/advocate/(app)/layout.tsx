import { getTranslations } from "next-intl/server";
import { requireAdvocate } from "@/lib/auth/session";
import { AppHeader } from "@/components/shell/AppHeader";
import type { Locale } from "@/i18n/routing";

export default async function AdvocateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as Locale;
  const user = await requireAdvocate(locale);
  const t = await getTranslations("advocatePortal");
  return (
    <>
      <AppHeader locale={locale} home="/advocate" portal={t("portal")} items={[{ href: "/advocate", label: t("title"), prefix: true }]} user={user.full_name ?? ""} />
      <div id="main">{children}</div>
    </>
  );
}
