import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdvocateAs, type ServiceMethod } from "@/lib/advocates/notify";
import { buildNoticeLetter } from "@/lib/advocates/notice-letter";

/**
 * Officer notifies the advocate and receives the notice letter PDF in the same response.
 * The activation code exists in clear only inside this PDF.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  try {
    actor = await assertStaff(["staff", "admin"]);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const body = (await req.json().catch(() => null)) as { servedOn?: string; method?: string; shareDocumentIds?: unknown } | null;
  if (!body?.servedOn || !body.method) return Response.json({ error: "invalid" }, { status: 400 });

  let result;
  try {
    result = await notifyAdvocateAs(actor, id, {
      servedOn: body.servedOn,
      method: body.method as ServiceMethod,
      shareDocumentIds: Array.isArray(body.shareDocumentIds) ? body.shareDocumentIds.map(String) : [],
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }

  const { data: c } = await createAdminClient()
    .from("cases")
    .select("case_number,summary,description,advocate_served_on,office,complainant:profiles!cases_complainant_id_fkey(full_name),advocate:advocates(full_name,admission_no,firm)")
    .eq("id", id)
    .single();
  const adv = c!.advocate as unknown as { full_name: string; admission_no: string; firm: string | null };
  const comp = c!.complainant as unknown as { full_name: string | null } | null;
  const origin = new URL(req.url).origin;
  const pdf = await buildNoticeLetter({
    caseNumber: c!.case_number,
    advocateName: adv.full_name,
    admissionNo: adv.admission_no,
    firm: adv.firm,
    complainantName: comp?.full_name ?? "the complainant",
    summary: c!.summary,
    description: c!.description,
    servedOn: body.servedOn,
    responseDue: result.responseDue,
    activationCode: result.activationCode,
    portalUrl: `${origin}/en/advocate/activate`,
    office: c!.office ?? actor.office ?? "Nairobi",
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="notice-${c!.case_number.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
