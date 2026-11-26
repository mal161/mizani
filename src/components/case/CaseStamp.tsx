import { Link } from "@/i18n/routing";

/**
 * The signature detail: a case number set like a registry stamp (mono, ink-green, thin border).
 * Used wherever a case number is shown; links keep the number as their accessible name.
 */
export function CaseStamp({ number, href, size = "sm", testId }: { number: string; href?: string; size?: "sm" | "lg"; testId?: string }) {
  const cls = `case-stamp ${size === "lg" ? "px-2 py-0.5 text-xl" : "text-sm"}`;
  return href ? (
    <Link href={href} data-testid={testId} className={cls}>
      {number}
    </Link>
  ) : (
    <span data-testid={testId} className={cls}>
      {number}
    </span>
  );
}
