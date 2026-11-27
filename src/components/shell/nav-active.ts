export interface NavMatch {
  href: string;
  /** Match sub-pages too (e.g. /staff/admin/...). Exact match when false. */
  prefix?: boolean;
  /** Other sections that belong to this item, matched with their sub-pages (e.g. Workspace owns /staff/cases). */
  also?: string[];
}

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Whether a nav item is the current page (orange underline, aria-current). */
export function isNavActive(pathname: string, item: NavMatch): boolean {
  if (item.prefix ? within(pathname, item.href) : pathname === item.href) return true;
  return (item.also ?? []).some((base) => within(pathname, base));
}
