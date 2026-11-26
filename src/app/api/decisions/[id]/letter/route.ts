import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdvocateCase } from "@/lib/advocates/respond";
import { buildDecisionLetter } from "@/lib/commission/decision-letter";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The decision letter: staff (aal2), the case's complainant, or the notified advocate. Audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const { data: d } = await createAdminClient()
    .from("decisions")
    .select("id,case_id,cases(case_number,complainant_id)")
    .eq("id", id)
    .maybeSingle();
  if (!d) return new Response("Not found", { status: 404 });
  const c = d.cases as unknown as { case_number: string; complainant_id: string };

  let actorId: string | null = null;
  try {
    actorId = (await assertStaff()).id;
  } catch (e) {
    if (!(e instanceof ForbiddenError)) throw e;
    const { data: u } = await (await createServerClient()).auth.getUser();
    const uid = u.user?.id;
    if (uid && (uid === c.complainant_id || (await isAdvocateCase(uid, d.case_id)))) actorId = uid;
  }
  if (!actorId) return new Response("Not found", { status: 404 });

  const pdf = await buildDecisionLetter(id);
  await logAudit({ actorId, channel: "web", action: "download_decision", entity: "cases", entityId: d.case_id, details: { decision_id: id } });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="decision-${c.case_number.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
