import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for; first entry is the client). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** True for requests from this machine (local dev / e2e), which are exempt from per-IP limits. */
export function isLoopback(ip: string): boolean {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}
