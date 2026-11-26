import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { auditQuery, filtersFrom } from "@/lib/admin/audit-query";
import { Link, type Locale } from "@/i18n/routing";

const PAGE_SIZE = 50;

export default async function AuditAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = (await params).locale as Locale;
  await requireStaff(locale, ["admin"]);
  const sp = await searchParams;
  const filters = filtersFrom(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const t = await getTranslations("admin.audit");
  const format = await getFormatter();
  const supabase = await createServerClient();
  const { rows, count } = await auditQuery(supabase, filters, (page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const field = "rounded-md border px-2 py-1.5 text-sm";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6" action={`/${locale}/staff/admin/audit`}>
        <label className="flex flex-col gap-1 text-sm">
          {t("caseNumber")}
          <input name="caseNumber" defaultValue={filters.caseNumber} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("actor")}
          <input name="actor" defaultValue={filters.actor} placeholder="uuid" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("action")}
          <input name="action" defaultValue={filters.action} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("from")}
          <input name="from" type="date" defaultValue={filters.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("to")}
          <input name="to" type="date" defaultValue={filters.to} className={field} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-hover">
            {t("filter")}
          </button>
          <a href={`/api/admin/audit?${qs.toString()}`} className="rounded-md border px-3 py-1.5 text-sm">
            {t("export")}
          </a>
        </div>
      </form>
      <p className="text-sm text-slate-500">{t("count", { count: count ?? 0 })}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2">{t("when")}</th>
              <th className="px-2 py-2">{t("action")}</th>
              <th className="px-2 py-2">{t("actor")}</th>
              <th className="px-2 py-2">{t("channel")}</th>
              <th className="px-2 py-2">{t("entity")}</th>
              <th className="px-2 py-2">{t("details")}</th>
            </tr>
          </thead>
          <tbody className="divide-y font-mono">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-2 py-1">
                  {format.dateTime(new Date(r.at), { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Nairobi" })}
                </td>
                <td className="px-2 py-1">{r.action}</td>
                <td className="px-2 py-1">{r.actor_id ? r.actor_id.slice(0, 8) : "system"}</td>
                <td className="px-2 py-1">{r.actor_channel}</td>
                <td className="px-2 py-1">
                  {r.entity}:{String(r.entity_id).slice(0, 8)}
                </td>
                <td className="max-w-md truncate px-2 py-1" title={JSON.stringify(r.details)}>
                  {JSON.stringify(r.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex gap-3 text-sm">
          {page > 1 && <Link href={`/staff/admin/audit?${qs.toString()}&page=${page - 1}`}>← {t("previous")}</Link>}
          <span>{t("pageOf", { page, pages })}</span>
          {page < pages && <Link href={`/staff/admin/audit?${qs.toString()}&page=${page + 1}`}>{t("next")} →</Link>}
        </nav>
      )}
    </main>
  );
}
