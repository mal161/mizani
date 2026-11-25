import { ussdResponse } from "@/lib/ussd/menu";
import { checkStatus } from "@/lib/cases/status-check";

/**
 * Africa's Talking USSD callback. AT posts form fields: sessionId, serviceCode, phoneNumber, text.
 * If USSD_CALLBACK_SECRET is set, the callback URL must include ?key=<secret>.
 */
export async function POST(req: Request) {
  const secret = process.env.USSD_CALLBACK_SECRET;
  if (secret && new URL(req.url).searchParams.get("key") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const form = await req.formData();
  const text = String(form.get("text") ?? "");
  let reply: string;
  try {
    reply = await ussdResponse(text, checkStatus);
  } catch (e) {
    console.error("USSD error", e);
    reply = "END Service unavailable. Try again later. / Huduma haipatikani kwa sasa.";
  }
  return new Response(reply, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
