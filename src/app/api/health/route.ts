import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai";
import { hasCronSecret } from "@/lib/auth/cron-secret";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * Liveness for monitoring. Anyone gets `{ ok, db, time }`; 503 when the database is unreachable.
 * With `Authorization: Bearer $CRON_SECRET` it also names the SMS and AI providers and the version, for checking an
 * installation; those are withheld from anonymous callers so the endpoint does not describe the setup to strangers.
 */
export async function GET(req: Request) {
  let db: "ok" | "error" = "ok";
  try {
    // One row at most and no count: the endpoint is unauthenticated, so it must stay cheap.
    const { error } = await createAdminClient().from("cases").select("id").limit(1);
    if (error) db = "error";
  } catch {
    db = "error";
  }
  const ok = db === "ok";
  const details = hasCronSecret(req.headers.get("authorization"))
    ? {
        sms: process.env.SMS_PROVIDER === "africastalking" ? "africastalking" : "fake",
        ai: getAiProvider()?.name ?? "none",
        version: pkg.version,
      }
    : {};
  const body = { ok, db, ...details, time: new Date().toISOString() };
  return Response.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
