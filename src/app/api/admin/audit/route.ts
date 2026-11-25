import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { auditQuery, filtersFrom, toCsv } from "@/lib/admin/audit-query";
import { logAudit } from "@/lib/audit";

const MAX_ROWS = 10_000;

/** CSV export of the filtered audit log (admins only). The export itself is audited. */
export async function GET(req: Request) {
  let actorId: string;
  try {
    actorId = (await assertStaff(["admin"])).id;
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const filters = filtersFrom(Object.fromEntries(new URL(req.url).searchParams));
  const supabase = await createServerClient();
  const { rows } = await auditQuery(supabase, filters, 0, MAX_ROWS - 1);
  await logAudit({
    actorId,
    channel: "web",
    action: "admin_export_audit",
    entity: "audit_log",
    entityId: "*",
    details: { filters, rows: rows.length },
  });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mizani-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
