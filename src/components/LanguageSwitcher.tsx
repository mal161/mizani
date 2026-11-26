"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, routing } from "@/i18n/routing";

/** English | Kiswahili as two links (government-portal style), keeping the current page. */
export function LanguageSwitcher({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const pathname = usePathname();
  const light = tone === "light";
  return (
    <nav aria-label={t("label")} className="flex items-center gap-1 text-sm">
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className={light ? "text-slate-400" : "text-slate-300"}>|</span>}
          <Link
            href={pathname}
            locale={l}
            lang={l}
            aria-current={l === locale ? "true" : undefined}
            className={`rounded px-1.5 py-1 ${
              l === locale
                ? `font-medium ${light ? "text-white" : "text-primary"}`
                : `underline-offset-2 hover:underline ${light ? "text-slate-300" : "text-slate-600"}`
            }`}
          >
            {t(l)}
          </Link>
        </span>
      ))}
    </nav>
  );
}
