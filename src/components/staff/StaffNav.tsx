import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { StaffUser } from "@/lib/auth/staff-types";
import { AppHeader } from "@/components/shell/AppHeader";

export async function StaffNav({ user, locale, unread }: { user: StaffUser; locale: Locale; unread: number }) {
  const t = await getTranslations("staffNav");
  const items = [
    { href: "/staff", label: t("workspace"), also: ["/staff/cases"] },
    ...(user.role !== "commissioner" ? [{ href: "/staff/intake", label: t("intake") }] : []),
    ...(user.role === "admin" ? [{ href: "/staff/admin", label: t("admin"), prefix: true }] : []),
    ...(user.role === "admin" || user.role === "commissioner" ? [{ href: "/commission", label: t("commission") }] : []),
    { href: "/staff/notifications", label: t("notifications"), badge: unread, ariaLabel: t("notificationsCount", { count: unread }) },
  ];
  return (
    <AppHeader
      locale={locale}
      home="/staff"
      portal={t("portal")}
      items={items}
      user={`${user.full_name ?? ""} · ${t(`roles.${user.role}`)}`}
      signOutTo="staff"
    />
  );
}
