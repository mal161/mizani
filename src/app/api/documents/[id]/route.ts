import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Evidence download: the caller's own RLS-scoped read decides access (complainant: own case, not internal;
 * staff: aal2). The download is audited, then the caller is redirected to a 60-second signed URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new Response("Not found", { status: 404 });

  const { data: doc } = await supabase
    .from("documents")
    .select("id,case_id,storage_path,file_name")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  await logAudit({
    actorId: user.user.id,
    channel: "web",
    action: "download",
    entity: "documents",
    entityId: doc.id,
    details: { case_id: doc.case_id, file_name: doc.file_name },
  });
  const { data: signed } = await createAdminClient()
    .storage.from("evidence")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (!signed?.signedUrl) return new Response("Unavailable", { status: 503 });
  return Response.redirect(signed.signedUrl, 302);
}
