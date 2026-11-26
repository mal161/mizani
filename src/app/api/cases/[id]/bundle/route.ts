import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCaseBundle } from "@/lib/commission/bundle";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The full case bundle (confidential, internal notes included) for officers, admins and commissioners. Audited. */
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
  const { data: c } = await createAdminClient().from("cases").select("case_number").eq("id", id).maybeSingle();
  if (!c) return new Response("Not found", { status: 404 });

  const pdf = await buildCaseBundle(id);
  await logAudit({ actorId: actor.id, channel: "web", action: "download_bundle", entity: "cases", entityId: id });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bundle-${c.case_number.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
