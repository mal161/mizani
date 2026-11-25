import { timingSafeEqual } from "node:crypto";
import { sweepDeadlines } from "@/lib/cases/deadlines";

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hourly deadline sweep (Vercel Cron sends Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  if (!authorised(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDeadlines(new Date());
  return Response.json(result);
}
