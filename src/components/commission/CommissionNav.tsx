import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { StaffUser } from "@/lib/auth/staff-types";
import { AppHeader } from "@/components/shell/AppHeader";

export async function CommissionNav({ user, locale }: { user: StaffUser; locale: Locale }) {
  const t = await getTranslations("commission.nav");
  const tRoles = await getTranslations("staffNav.roles");
  return (
    <AppHeader
      locale={locale}
      home="/commission"
      portal={t("brand")}
      items={[
        { href: "/commission", label: t("dashboard"), also: ["/commission/cases"] },
        { href: "/commission/hearings", label: t("hearings") },
        { href: "/commission/analytics", label: t("analytics") },
        { href: "/staff", label: t("workspace") },
      ]}
      user={`${user.full_name ?? ""} · ${tRoles(user.role)}`}
      signOutTo="staff"
    />
  );
}
