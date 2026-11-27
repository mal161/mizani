import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import type { Locale } from "@/i18n/routing";
import { deleteRuleAction } from "../actions";
import { RuleForm } from "./RuleForm";

export default async function RoutingAdmin({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  await requireStaff(locale, ["admin"]);
  const t = await getTranslations("admin.routing");
  const tCat = await getTranslations("categories");
  const tPri = await getTranslations("staffCases.priorities");
  const admin = createAdminClient();
  const [{ data: rules }, { data: officers }, cfg] = await Promise.all([
    admin.from("routing_rules").select("*").order("position"),
    admin.from("profiles").select("id,full_name,office").in("role", ["staff", "admin"]).eq("active", true).order("full_name"),
    loadWorkflowConfig(),
  ]);
  const names = new Map((officers ?? []).map((o) => [o.id, `${o.full_name ?? o.id.slice(0, 8)}${o.office ? ` (${o.office})` : ""}`]));
  const catName = (k: string) => (tCat.has(k) ? tCat(k) : k);
  const path = `/${locale}/staff/admin/routing`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="text-slate-600">{t("explain")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">{t("position")}</th>
              <th className="px-3 py-2">{t("category")}</th>
              <th className="px-3 py-2">{t("priority")}</th>
              <th className="px-3 py-2">{t("office")}</th>
              <th className="px-3 py-2">{t("officers")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(rules ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  {t("none")}
                </td>
              </tr>
            )}
            {(rules ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.position}</td>
                <td className="px-3 py-2">{r.category ? catName(r.category) : t("any")}</td>
                <td className="px-3 py-2">{r.priority ? tPri(r.priority) : t("any")}</td>
                <td className="px-3 py-2">{r.office ?? t("any")}</td>
                <td className="px-3 py-2">{(r.officer_ids as string[]).map((id) => names.get(id) ?? t("inactive")).join(", ")}</td>
                <td className="px-3 py-2">
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <input type="hidden" name="path" value={path} />
                    <button type="submit" className="rounded border px-2 text-red-700">
                      {t("delete")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RuleForm
        path={path}
        categories={cfg.categories.map((k) => ({ value: k, label: catName(k) }))}
        officers={[...names].map(([value, label]) => ({ value, label }))}
      />
    </main>
  );
}
