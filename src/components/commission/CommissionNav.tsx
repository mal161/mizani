import { getTranslations } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOutAction } from "@/lib/auth/signout-action";
import type { StaffUser } from "@/lib/auth/staff-types";

export async function CommissionNav({ user, locale }: { user: StaffUser; locale: Locale }) {
  const t = await getTranslations("commission.nav");
  const tRoles = await getTranslations("staffNav.roles");
  return (
    <header className="border-b bg-slate-900 text-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <Link href="/commission" className="font-medium">
          Mizani · {t("brand")}
        </Link>
        <Link href="/commission">{t("dashboard")}</Link>
        <Link href="/commission/hearings">{t("hearings")}</Link>
        <Link href="/commission/analytics">{t("analytics")}</Link>
        <Link href="/staff">{t("workspace")}</Link>
        <span className="ml-auto text-slate-300">
          {user.full_name ?? ""} · {tRoles(user.role)}
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
