import { createAdminClient } from "@/lib/supabase/admin";
import { getAiProvider } from "@/lib/ai";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * Liveness for monitoring (no auth). Reports whether the database answers and which providers are configured —
 * names only: no URLs, keys, counts or personal data. 503 when the database is unreachable.
 */
export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    // One row at most and no count: the endpoint is unauthenticated, so it must stay cheap.
    const { error } = await createAdminClient().from("cases").select("id").limit(1);
    if (error) db = "error";
  } catch {
    db = "error";
  }
  const body = {
    ok: db === "ok",
    db,
    sms: process.env.SMS_PROVIDER === "africastalking" ? "africastalking" : "fake",
    ai: getAiProvider()?.name ?? "none",
    version: pkg.version,
    time: new Date().toISOString(),
  };
  return Response.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
