import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReferralPack } from "@/lib/commission/referrals";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tribunal referral pack (decision letter + full bundle) for staff roles. Audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor;
  try {
    actor = await assertStaff();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const { data: r } = await createAdminClient().from("referrals").select("case_id").eq("id", id).maybeSingle();
  if (!r) return new Response("Not found", { status: 404 });

  const { pdf, caseNumber } = await buildReferralPack(id);
  await logAudit({ actorId: actor.id, channel: "web", action: "download_referral_pack", entity: "cases", entityId: r.case_id, details: { referral_id: id } });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="referral-${caseNumber.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
