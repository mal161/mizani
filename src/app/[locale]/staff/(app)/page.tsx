import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import { CaseTable, type StaffCaseRow } from "@/components/staff/CaseTable";
import { Link, type Locale } from "@/i18n/routing";

const TABS = ["mine", "unassigned", "overdue", "all"] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZE = 25;

export default async function StaffHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ tab?: string; q?: string; page?: string; advocate?: string }>;
}) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "mine";
  const q = (sp.q ?? "").trim().slice(0, 100);
  // Cases against one advocate on the roll (linked from analytics). Ignored unless it is a UUID.
  const advocate = typeof sp.advocate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.advocate) ? sp.advocate : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const t = await getTranslations("staffHome");

  const supabase = await createServerClient();
  let query = supabase
    .from("staff_cases")
    .select(
      "id,case_number,summary,stage,priority,category,advocate_name_given,complainant_name,assigned_officer_name,open_deadline_due,created_at",
      { count: "exact" },
    );
  if (tab === "mine") query = query.eq("assigned_officer_id", user.id).neq("stage", "closed");
  if (tab === "unassigned") query = query.is("assigned_officer_id", null).neq("stage", "closed");
  if (tab === "overdue") query = query.lt("open_deadline_due", new Date().toISOString()).neq("stage", "closed");
  if (advocate) query = query.eq("advocate_id", advocate);
  if (q) {
    const asNumber = parseCaseNumberInput(q);
    if (asNumber) query = query.eq("case_number", asNumber);
    else {
      const safe = q.replace(/[%_,().*"\\]/g, " ");
      query = query.or(`summary.ilike.%${safe}%,advocate_name_given.ilike.%${safe}%,complainant_name.ilike.%${safe}%`);
    }
  }
  const { data, count } = await query
    .order(tab === "overdue" ? "open_deadline_due" : "created_at", { ascending: tab === "overdue" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const stageLabels = (await loadWorkflowConfig()).stageLabels[locale] ?? {};
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (p: Partial<{ tab: Tab; q: string; page: number }>) => {
    const s = new URLSearchParams({
      tab: p.tab ?? tab,
      ...(p.q ?? q ? { q: p.q ?? q } : {}),
      ...(advocate ? { advocate } : {}),
      page: String(p.page ?? 1),
    });
    return `/staff?${s.toString()}`;
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((k) => (
          <Link
            key={k}
            href={href({ tab: k, q: "" })}
            aria-current={k === tab ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${k === tab ? "bg-slate-900 text-white" : "border"}`}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action={`/${locale}/staff`}>
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="w-64 rounded-md border px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {t("search")}
          </button>
        </form>
      </div>
      <CaseTable rows={(data ?? []) as StaffCaseRow[]} locale={locale} stageLabels={stageLabels} />
      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label={t("pagination")}>
          {page > 1 && <Link href={href({ page: page - 1 })}>← {t("previous")}</Link>}
          <span>{t("pageOf", { page, pages })}</span>
          {page < pages && <Link href={href({ page: page + 1 })}>{t("next")} →</Link>}
        </nav>
      )}
    </main>
  );
}
