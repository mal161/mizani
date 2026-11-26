import { getTranslations } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { signOutAction } from "@/lib/auth/signout-action";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Lockup } from "@/components/brand/Lockup";
import { NavLinks, type NavItem } from "./NavLinks";

/**
 * The navy band for staff, commission and advocate portals (DESIGN.md: app shell).
 * Lockup with the portal name, primary links (active = orange underline), the user, language and sign-out.
 */
export async function AppHeader({
  locale,
  home,
  portal,
  items,
  user,
  signOutTo,
}: {
  locale: Locale;
  home: string;
  portal: string;
  items: NavItem[];
  user: string;
  signOutTo?: "staff";
}) {
  const t = await getTranslations("shell");
  return (
    <header className="bg-primary text-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-primary">
        {t("skip")}
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-2 sm:px-6">
        <Link href={home} className="rounded py-1">
          <Lockup tone="light" compact descriptor={portal} />
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-slate-300">{user}</span>
          <LanguageSwitcher tone="light" />
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            {signOutTo && <input type="hidden" name="to" value={signOutTo} />}
            <button type="submit" className="rounded px-1.5 py-1 text-slate-300 underline-offset-2 hover:text-white hover:underline">
              {t("nav.signOut")}
            </button>
          </form>
        </div>
      </div>
      <div className="mx-auto mt-1 h-11 max-w-7xl px-1 sm:px-3">
        <NavLinks tone="light" label={t("nav.label")} items={items} />
      </div>
    </header>
  );
}
