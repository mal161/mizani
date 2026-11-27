import { sweepDeadlines } from "@/lib/cases/deadlines";
import { sweepOcr } from "@/lib/ocr/run";
import { hasCronSecret } from "@/lib/auth/cron-secret";

/** Daily sweep: deadlines, then OCR retries and backfill (Vercel Cron sends Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  if (!hasCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDeadlines(new Date());
  const ocr = await sweepOcr();
  return Response.json({ ...result, ocr });
}
