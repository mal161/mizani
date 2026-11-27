import { getFormatter, getTranslations } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { caseSlug } from "@/lib/cases/case-number";
import { StageBadge } from "@/components/case/StageBadge";
import { isStage, type Stage } from "@/lib/cases/stages";

export interface StaffCaseRow {
  id: string;
  case_number: string;
  summary: string;
  stage: string;
  priority: string;
  category: string | null;
  advocate_name_given: string;
  complainant_name: string | null;
  assigned_officer_name: string | null;
  open_deadline_due: string | null;
  created_at: string;
}

export async function CaseTable({
  rows,
  locale,
  stageLabels,
}: {
  rows: StaffCaseRow[];
  locale: Locale;
  stageLabels: Partial<Record<Stage, string>>;
}) {
  const t = await getTranslations("staffCases");
  const format = await getFormatter();
  const now = Date.now();
  if (rows.length === 0) return <p className="py-8 text-center text-slate-500">{t("empty")}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2">{t("caseNumber")}</th>
            <th className="px-3 py-2">{t("summary")}</th>
            <th className="px-3 py-2">{t("stage")}</th>
            <th className="px-3 py-2">{t("priority")}</th>
            <th className="px-3 py-2">{t("officer")}</th>
            <th className="px-3 py-2">{t("due")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const due = r.open_deadline_due ? new Date(r.open_deadline_due) : null;
            const overdue = due !== null && due.getTime() < now;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2">
                  <Link href={`/staff/cases/${caseSlug(r.case_number)}`} className="case-stamp text-sm">
                    {r.case_number}
                  </Link>
                </td>
                <td className="max-w-xs px-3 py-2">
                  <p className="truncate">{r.summary}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.complainant_name ?? "—"} → {r.advocate_name_given}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <StageBadge stage={r.stage} label={isStage(r.stage) ? stageLabels[r.stage] : undefined} />
                </td>
                <td className="px-3 py-2">{t(`priorities.${r.priority}`)}</td>
                <td className="px-3 py-2">{r.assigned_officer_name ?? <span className="text-slate-400">{t("unassigned")}</span>}</td>
                <td className={`px-3 py-2 ${overdue ? "font-medium text-red-700" : ""}`}>
                  {due
                    ? `${overdue ? `${t("overdue")} · ` : ""}${format.dateTime(due, { dateStyle: "medium", timeZone: "Africa/Nairobi" })}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
