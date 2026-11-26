"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { OUTCOMES } from "@/lib/commission/outcomes";
import { recordDecisionAction } from "./actions";

const field = "rounded-md border px-2 py-1.5 text-sm font-normal";

export function DecisionForm(props: {
  caseId: string;
  path: string;
  members: { id: string; name: string }[];
  defaultPanel: string[];
  correcting: boolean;
}) {
  const t = useTranslations("commission");
  const [state, act, pending] = useActionState(recordDecisionAction, {});
  const v = state.values ?? {};
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const [outcome, setOutcome] = useState(str("outcome"));
  const panel = Array.isArray(v.panel) ? v.panel : props.defaultPanel;

  return (
    <form action={act} key={state.at ?? 0} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="caseId" value={props.caseId} />
      <input type="hidden" name="path" value={props.path} />
      <h3 className="font-medium">{props.correcting ? t("decision.correctTitle") : t("decision.title")}</h3>
      {props.correcting && <p className="text-xs text-slate-500">{t("decision.correctHint")}</p>}

      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("decision.outcome")}
        <select name="outcome" required value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label={t("decision.outcome")} className={field}>
          <option value="" disabled>
            {t("decision.choose")}
          </option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {t(`outcomes.${o}`)}
            </option>
          ))}
        </select>
      </label>

      {outcome === "refund_ordered" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("decision.amount")}
          <input name="amount" inputMode="decimal" required defaultValue={str("amount")} className={field} />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("decision.reasons")}
        <textarea name="reasons" rows={8} required minLength={50} maxLength={20000} defaultValue={str("reasons")} className={field} />
      </label>
      <p className="-mt-2 text-xs text-slate-500">{t("decision.reasonsHint")}</p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("decision.orders")}
        <textarea name="orders" rows={3} defaultValue={str("orders")} className={field} />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">{t("decision.panel")}</legend>
        {props.members.map((m) => (
          <label key={m.id} className="flex items-center gap-2">
            <input type="checkbox" name="panel" value={m.id} defaultChecked={panel.includes(m.id)} />
            {m.name}
          </label>
        ))}
      </fieldset>

      <p className="text-xs text-slate-500">{t("decision.publishedNote")}</p>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {props.correcting ? t("decision.correct") : t("decision.record")}
      </button>
    </form>
  );
}
