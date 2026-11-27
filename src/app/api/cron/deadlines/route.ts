import { sweepDeadlines } from "@/lib/cases/deadlines";
import { sweepOcr } from "@/lib/ocr/run";
import { hasCronSecret } from "@/lib/auth/cron-secret";
import { purgeTestSms } from "@/lib/sms/test-inbox";

/** Daily sweep: deadlines, OCR retries and backfill, then the test SMS inbox purge (Vercel Cron sends Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  if (!hasCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDeadlines(new Date());
  const ocr = await sweepOcr();
  const testSmsPurged = await purgeTestSms(new Date());
  return Response.json({ ...result, ocr, testSmsPurged });
}
