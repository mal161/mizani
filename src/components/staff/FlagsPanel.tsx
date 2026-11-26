import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { caseSlug } from "@/lib/cases/case-number";
import type { CaseFlags } from "@/lib/cases/flags";

/** Database-derived flags (no AI): possible duplicates and the advocate's complaint history. */
export async function FlagsPanel({ flags }: { flags: CaseFlags }) {
  const t = await getTranslations("flags");
  const format = await getFormatter();
  const h = flags.advocate_history;
  return (
    <section aria-label={t("panel")} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <h3 className="font-medium">{t("panel")}</h3>
      {flags.possible_duplicates.length > 0 ? (
        <div>
          <p className="font-medium text-amber-800">{t("duplicates")}</p>
          <ul className="list-disc pl-5">
            {flags.possible_duplicates.map((d) => (
              <li key={d.case_number}>
                <Link href={`/staff/cases/${caseSlug(d.case_number)}`} className="case-stamp text-sm">
                  {d.case_number}
                </Link>{" "}
                · {format.dateTime(new Date(d.created_at), { dateStyle: "medium", timeZone: "Africa/Nairobi" })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-slate-600">{t("noDuplicates")}</p>
      )}
      {h ? (
        <p>{t("history", { total: h.total, open: h.open, closed: h.closed, recent: h.last_12_months })}</p>
      ) : (
        <p className="text-slate-600">{t("notOnRoll")}</p>
      )}
    </section>
  );
}
