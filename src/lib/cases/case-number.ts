const CANONICAL = /^ACC\/(\d{4})\/(\d{6})$/;

/** URL-safe form: ACC/2026/000123 -> ACC-2026-000123 */
export function caseSlug(caseNumber: string): string {
  return caseNumber.replaceAll("/", "-");
}

export function caseNumberFromSlug(slug: string): string | null {
  const m = /^ACC-(\d{4})-(\d{6})$/.exec(slug);
  return m ? `ACC/${m[1]}/${m[2]}` : null;
}

/**
 * Accepts what a person might type (any case, -, /, spaces, or 10 bare digits as on a USSD keypad)
 * and returns the canonical case number, or null.
 */
export function parseCaseNumberInput(input: string): string | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  const digits = s.replace(/^ACC/, "").replace(/[-/]/g, "");
  if (!/^\d{10}$/.test(digits)) return null;
  const n = `ACC/${digits.slice(0, 4)}/${digits.slice(4)}`;
  return CANONICAL.test(n) ? n : null;
}
