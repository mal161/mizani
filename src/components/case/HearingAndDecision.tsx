import { getFormatter, getTranslations } from "next-intl/server";
import { partyHearingAndDecision } from "@/lib/commission/party";

/** Next hearing and the Commission's decision, for the complainant's and the advocate's case pages. */
export async function HearingAndDecision({ caseId }: { caseId: string }) {
  const { hearing, decision } = await partyHearingAndDecision(caseId);
  if (!hearing && !decision) return null;
  const t = await getTranslations("partyCase");
  const tOut = await getTranslations("commission.outcomes");
  const format = await getFormatter();

  return (
    <>
      {decision && (
        <section data-testid="decision-card" className="flex flex-col gap-2 rounded-lg border-2 border-emerald-800 bg-emerald-50 p-4">
          <h2 className="text-lg font-semibold">{t("decisionTitle")}</h2>
          <p className="text-base font-semibold">{tOut(decision.outcome)}</p>
          {decision.amount_kes != null && (
            <p className="font-medium">
              {t("amount")}: KES {format.number(Number(decision.amount_kes), { maximumFractionDigits: 2 })}
            </p>
          )}
          <p className="text-xs text-slate-600">
            {t("decidedOn", { date: format.dateTime(new Date(decision.decided_at), { dateStyle: "long", timeZone: "Africa/Nairobi" }) })}
          </p>
          <h3 className="font-medium">{t("reasons")}</h3>
          <p className="whitespace-pre-wrap text-sm">{decision.reasons}</p>
          {decision.orders && (
            <>
              <h3 className="font-medium">{t("orders")}</h3>
              <p className="whitespace-pre-wrap text-sm">{decision.orders}</p>
            </>
          )}
          <a href={`/api/decisions/${decision.id}/letter`} className="self-start underline">
            {t("downloadLetter")}
          </a>
        </section>
      )}
      {hearing && (
        <section data-testid="next-hearing" className="flex flex-col gap-1 rounded-lg border-2 border-sky-700 bg-sky-50 p-4">
          <h2 className="text-lg font-semibold">{t("hearingTitle")}</h2>
          <p className="font-medium">
            {format.dateTime(new Date(hearing.starts_at), { dateStyle: "full", timeStyle: "short", hourCycle: "h23", timeZone: "Africa/Nairobi" })}
          </p>
          <p className="text-sm text-slate-700">{t("duration", { minutes: hearing.duration_minutes })}</p>
          {hearing.mode === "online" ? (
            <p className="text-sm">
              {t("online")}:{" "}
              {hearing.online_link && (
                <a href={hearing.online_link} rel="noopener noreferrer" target="_blank" className="break-all underline">
                  {hearing.online_link}
                </a>
              )}
            </p>
          ) : (
            <p className="text-sm">
              {t("venue")}: {hearing.venue}
            </p>
          )}
          <p className="text-xs text-slate-600">{t("hearingHint")}</p>
        </section>
      )}
    </>
  );
}
