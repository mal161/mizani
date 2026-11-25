/**
 * Normalizes a Kenyan mobile number to E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
 * Accepts 07.., 01.., 7.., 1.., 254.., +254.. with spaces/dashes. Returns null if invalid.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  const m = /^(?:\+?254|0)?([17]\d{8})$/.exec(digits);
  return m ? `+254${m[1]}` : null;
}
