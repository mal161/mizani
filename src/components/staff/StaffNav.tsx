import { getTranslations } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/lib/auth/signout-action";
import type { StaffUser } from "@/lib/auth/staff-types";

export async function StaffNav({ user, locale, unread }: { user: StaffUser; locale: Locale; unread: number }) {
  const t = await getTranslations("staffNav");
  return (
    <header className="border-b bg-slate-900 text-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <Link href="/staff" className="font-semibold">
          Mizani · ACC
        </Link>
        <Link href="/staff">{t("workspace")}</Link>
        {user.role !== "commissioner" && <Link href="/staff/intake">{t("intake")}</Link>}
        {user.role === "admin" && <Link href="/staff/admin">{t("admin")}</Link>}
        <Link href="/staff/notifications" aria-label={t("notificationsCount", { count: unread })} className="relative">
          {t("notifications")}
          {unread > 0 && (
            <span data-testid="unread-count" className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">
              {unread}
            </span>
          )}
        </Link>
        <span className="ml-auto text-slate-300">
          {user.full_name ?? ""} · {t(`roles.${user.role}`)}
        </span>
        <div className="rounded bg-white px-1 text-slate-900">
          <LanguageSwitcher />
        </div>
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="to" value="staff" />
          <button type="submit" className="underline">
            {t("signOut")}
          </button>
        </form>
      </nav>
    </header>
  );
}
