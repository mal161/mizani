import { requireStaff } from "@/lib/auth/staff";
import { CommissionNav } from "@/components/commission/CommissionNav";
import type { Locale } from "@/i18n/routing";
import { COMMISSION_ROLES } from "@/lib/commission/roles";

export default async function CommissionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as Locale;
  const user = await requireStaff(locale, COMMISSION_ROLES);
  return (
    <>
      <CommissionNav user={user} locale={locale} />
      <div id="main">{children}</div>
    </>
  );
}
