"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  applyAiAction,
  rerunTriageAction,
  summarizeAction,
  type ActionState,
} from "@/app/[locale]/staff/(app)/cases/[caseNumber]/actions";

export interface AiTriageView {
  status: "ok" | "unavailable";
  category?: string;
  categoryLabel?: string;
  priority?: string;
  urgency_reasons?: string[];
  summary_en?: string;
  summary_sw?: string;
  model: string;
  created_at: string;
}

export interface AiSummaryView {
  status: "ok" | "unavailable";
  summary_en?: string;
  summary_sw?: string;
  key_dates?: { date: string; event: string }[];
  open_questions?: string[];
  created_at: string;
}

const btn = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-60";

export function AiPanel(props: {
  caseId: string;
  path: string;
  aiOn: boolean;
  canWrite: boolean;
  triage: AiTriageView | null;
  summary: AiSummaryView | null;
}) {
  const t = useTranslations("ai");
  const tp = useTranslations("staffCase.priorities");
  const locale = useLocale();
  const other = locale === "sw" ? "en" : "sw";
  const [showOther, setShowOther] = useState(false);
  const [applyState, applyAct, applying] = useActionState(applyAiAction, {} as ActionState);
  const [rerunState, rerunAct, rerunning] = useActionState(rerunTriageAction, {} as ActionState);
  const [sumState, sumAct, summarizing] = useActionState(summarizeAction, {} as ActionState);
  const hidden = (
    <>
      <input type="hidden" name="caseId" value={props.caseId} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );
  const error = applyState.error ?? rerunState.error ?? sumState.error;
  const tr = props.triage;
  const pick = (v: { summary_en?: string; summary_sw?: string }, l: string) => (l === "sw" ? v.summary_sw : v.summary_en);

  return (
    <section aria-label={t("panel")} className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
      <h3 className="font-semibold">{t("panel")}</h3>
      {!props.aiOn ? (
        <p className="text-sm text-slate-600">{t("off")}</p>
      ) : (
        <>
          {!tr && <p className="text-sm text-slate-600">{t("none")}</p>}
          {tr?.status === "unavailable" && <p className="text-sm text-slate-600">{t("unavailable")}</p>}
          {tr?.status === "ok" && (
            <div className="flex flex-col gap-2 text-sm">
              <span className="self-start rounded bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-900">{t("label")}</span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-slate-500">{t("category")}</dt>
                <dd>{tr.categoryLabel ?? tr.category}</dd>
                <dt className="text-slate-500">{t("priority")}</dt>
                <dd data-testid="ai-priority">{tr.priority ? tp(tr.priority) : "—"}</dd>
              </dl>
              {tr.urgency_reasons && tr.urgency_reasons.length > 0 && (
                <ul className="list-disc pl-5 text-slate-700">
                  {tr.urgency_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="text-slate-700">{pick(tr, showOther ? other : locale)}</p>
              <button type="button" onClick={() => setShowOther((v) => !v)} className="self-start text-xs underline">
                {showOther ? t("showMine") : t("showOther")}
              </button>
              <p className="text-xs text-slate-500">{t("checkOriginal")}</p>
            </div>
          )}
          {props.canWrite && (
            <div className="flex flex-wrap gap-2">
              {tr?.status === "ok" && (
                <form action={applyAct}>
                  {hidden}
                  <button type="submit" disabled={applying} className={`${btn} bg-slate-900 text-white`}>
                    {t("apply")}
                  </button>
                </form>
              )}
              <form action={rerunAct}>
                {hidden}
                <button type="submit" disabled={rerunning} className={btn}>
                  {t("rerun")}
                </button>
              </form>
            </div>
          )}

          <form action={sumAct}>
            {hidden}
            <button type="submit" disabled={summarizing} className={btn}>
              {summarizing ? t("summarizing") : t("summarize")}
            </button>
          </form>
          {props.summary?.status === "unavailable" && <p className="text-sm text-slate-600">{t("summaryUnavailable")}</p>}
          {props.summary?.status === "ok" && (
            <div data-testid="ai-summary" className="flex flex-col gap-2 rounded border bg-white p-3 text-sm">
              <span className="self-start rounded bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-900">{t("summaryLabel")}</span>
              <p className="whitespace-pre-wrap">{pick(props.summary, locale)}</p>
              {!!props.summary.key_dates?.length && (
                <>
                  <p className="font-medium">{t("keyDates")}</p>
                  <ul className="list-disc pl-5">
                    {props.summary.key_dates.map((d, i) => (
                      <li key={i}>
                        {d.date}: {d.event}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!!props.summary.open_questions?.length && (
                <>
                  <p className="font-medium">{t("openQuestions")}</p>
                  <ul className="list-disc pl-5">
                    {props.summary.open_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${error}`)}
        </p>
      )}
    </section>
  );
}
