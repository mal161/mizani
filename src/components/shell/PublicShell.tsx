import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/signout-action";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Lockup } from "@/components/brand/Lockup";
import { NavLinks } from "./NavLinks";

/**
 * Public-service shell (DESIGN.md): utility strip → masthead with the lockup → page → footer.
 * Shows "My cases" and sign-out to a signed-in complainant, "Sign in" to everyone else.
 */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("shell");
  const locale = await getLocale();
  const user = await getCurrentUser();
  const complainant = user?.role === "complainant" ? user : null;
  const advocate = user?.role === "advocate" ? user : null;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t("skip")}
      </a>
      <div className="bg-slate-950 text-slate-300">
        <div className="mx-auto flex min-h-9 max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 text-sm sm:px-6">
          <span lang={locale}>{t("tagline")}</span>
          <div className="flex items-center gap-4">
            <LanguageSwitcher tone="light" />
            <Link href="/staff/login" className="hidden text-slate-300 underline-offset-2 hover:text-white hover:underline sm:inline">
              {t("staffSignIn")}
            </Link>
          </div>
        </div>
      </div>

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="rounded py-1" aria-label={`Mizani — ${t("org")}`}>
            <Lockup descriptor={t("descriptor")} org={t("org")} />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            {complainant ? (
              <>
                <Link href="/my/cases" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
                  {t("nav.myCases")}
                </Link>
                <form action={signOutAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <button type="submit" className="px-2 py-2 text-sm text-slate-600 underline-offset-2 hover:text-primary hover:underline">
                    {t("nav.signOut")}
                  </button>
                </form>
              </>
            ) : advocate ? (
              <Link href="/advocate" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
                {t("nav.advocatePortal")}
              </Link>
            ) : (
              <Link href="/login" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-soft">
                {t("nav.signIn")}
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto h-12 max-w-6xl px-1 sm:px-3">
          <NavLinks
            tone="dark"
            label={t("nav.label")}
            items={[
              { href: "/", label: t("nav.home") },
              { href: "/my/file", label: t("nav.file") },
              { href: "/status", label: t("nav.track") },
              { href: "/advocate/activate", label: t("nav.advocates") },
            ]}
          />
        </div>
      </header>

      <div id="main" className="flex-1">
        {children}
      </div>

      <footer className="bg-primary text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Lockup tone="light" descriptor={t("descriptor")} />
            <p className="max-w-md text-sm leading-6">{t("footer.about")}</p>
            <p className="max-w-md text-sm leading-6">{t("footer.dpa")}</p>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <h2 className="font-medium text-white">{t("footer.services")}</h2>
            <Link href="/my/file" className="hover:text-white hover:underline">{t("nav.file")}</Link>
            <Link href="/status" className="hover:text-white hover:underline">{t("nav.track")}</Link>
            <Link href="/login" className="hover:text-white hover:underline">{t("nav.myCases")}</Link>
            <Link href="/advocate/activate" className="hover:text-white hover:underline">{t("nav.advocates")}</Link>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <h2 className="font-medium text-white">{t("footer.staff")}</h2>
            <Link href="/staff/login" className="hover:text-white hover:underline">{t("staffSignIn")}</Link>
            <p className="leading-6">{t("footer.channels")}</p>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs sm:px-6">{t("footer.line")}</p>
        </div>
      </footer>
    </div>
  );
}
