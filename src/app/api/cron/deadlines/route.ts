import { sweepDeadlines } from "@/lib/cases/deadlines";
import { hasCronSecret } from "@/lib/auth/cron-secret";

/** Hourly deadline sweep (Vercel Cron sends Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  if (!hasCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDeadlines(new Date());
  return Response.json(result);
}
