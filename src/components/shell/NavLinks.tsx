"use client";

import { Link, usePathname } from "@/i18n/routing";
import { isNavActive, type NavMatch } from "./nav-active";

export interface NavItem extends NavMatch {
  label: string;
  badge?: number;
  ariaLabel?: string;
}

/** Primary navigation; the current page carries a 3px orange underline and aria-current. */
export function NavLinks({ items, tone, label }: { items: NavItem[]; tone: "dark" | "light"; label: string }) {
  const pathname = usePathname();
  const light = tone === "light";
  return (
    <nav aria-label={label} className="-mb-px flex h-full items-stretch gap-x-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
      {items.map((i) => {
        const active = isNavActive(pathname, i);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            aria-label={i.ariaLabel}
            className={`flex items-center gap-2 border-b-[3px] px-3 text-sm font-medium ${
              active
                ? `border-accent ${light ? "text-white" : "text-primary"}`
                : `border-transparent ${light ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-primary"}`
            }`}
          >
            {i.label}
            {i.badge ? (
              <span data-testid="unread-count" className="rounded bg-accent px-1.5 text-xs font-bold text-primary">
                {i.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
