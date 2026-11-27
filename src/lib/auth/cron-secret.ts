import { timingSafeEqual } from "node:crypto";

/** True when the Authorization header is exactly "Bearer $CRON_SECRET" (constant-time). False when no secret is set. */
export function hasCronSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
