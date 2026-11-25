import { getFormatter, getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { caseSlug } from "@/lib/cases/case-number";
import { StageBadge } from "@/components/case/StageBadge";
import { Link, type Locale } from "@/i18n/routing";

export default async function MyCasesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  await requireComplainant(locale);
  const t = await getTranslations("myCases");
  const format = await getFormatter();
  const supabase = await createServerClient();
  const { data: cases } = await supabase
    .from("my_cases")
    .select("id,case_number,summary,stage,created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href="/my/file" className="rounded-md bg-slate-900 px-4 py-2 text-white">
          {t("fileNew")}
        </Link>
      </div>
      {!cases?.length ? (
        <p className="text-slate-600">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {cases.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/my/cases/${caseSlug(c.case_number)}`} className="font-mono font-medium underline">
                  {c.case_number}
                </Link>
                <p className="truncate text-sm text-slate-600">{c.summary}</p>
                <p className="text-xs text-slate-500">
                  {t("filedOn", { date: format.dateTime(new Date(c.created_at), { dateStyle: "medium", timeZone: "Africa/Nairobi" }) })}
                </p>
              </div>
              <StageBadge stage={c.stage} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
