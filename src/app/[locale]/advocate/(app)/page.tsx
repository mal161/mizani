import { getFormatter, getTranslations } from "next-intl/server";
import { requireAdvocate } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { caseSlug } from "@/lib/cases/case-number";
import { StageBadge } from "@/components/case/StageBadge";
import { Link, type Locale } from "@/i18n/routing";

export default async function AdvocateHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  await requireAdvocate(locale);
  const t = await getTranslations("advocatePortal");
  const format = await getFormatter();
  const supabase = await createServerClient();
  // RLS: only notified cases against this advocate's roll entry.
  const [{ data: cases }, { data: responses }] = await Promise.all([
    supabase.from("advocate_cases").select("id,case_number,created_at,stage,summary,response_due").order("created_at", { ascending: false }),
    supabase.from("advocate_responses").select("case_id"),
  ]);
  const responded = new Set((responses ?? []).map((r) => r.case_id));
  const now = Date.now();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <h1 className="text-2xl font-medium">{t("title")}</h1>
      <p className="text-slate-600">{t("intro")}</p>
      {!cases?.length ? (
        <p className="text-slate-500">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {cases.map((c) => {
            const due = c.response_due ? new Date(c.response_due) : null;
            const overdue = due !== null && due.getTime() < now && !responded.has(c.id);
            return (
              <li key={c.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/advocate/cases/${caseSlug(c.case_number)}`} className="case-stamp text-sm">
                    {c.case_number}
                  </Link>
                  <p className="truncate text-sm text-slate-600">{c.summary}</p>
                  <p className={`text-xs ${overdue ? "font-medium text-red-700" : "text-slate-500"}`}>
                    {responded.has(c.id)
                      ? t("responded")
                      : due
                        ? t("dueOn", { date: format.dateTime(due, { dateStyle: "medium", timeZone: "Africa/Nairobi" }) })
                        : ""}
                  </p>
                </div>
                <StageBadge stage={c.stage} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
