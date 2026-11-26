import { getTranslations } from "next-intl/server";
import { requireAdvocate } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/signout-action";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, type Locale } from "@/i18n/routing";

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
      <header className="border-b bg-slate-800 text-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/advocate" className="font-medium">
            Mizani · {t("portal")}
          </Link>
          <span className="ml-auto text-slate-300">{user.full_name}</span>
          <div className="rounded bg-white px-1 text-slate-900">
            <LanguageSwitcher />
          </div>
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="underline">
              {t("signOut")}
            </button>
          </form>
        </nav>
      </header>
      {children}
    </>
  );
}
