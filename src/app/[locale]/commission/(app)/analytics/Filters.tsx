"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const field = "rounded-md border px-2 py-1.5 text-sm";

/** Period and office filters in one row; submits as a plain GET so the URL is shareable. */
export function Filters(props: { period: string; fromDay: string; toDay: string; office: string | null; offices: string[] }) {
  const t = useTranslations("analytics.filters");
  const [period, setPeriod] = useState(props.period);
  const offices = props.office && !props.offices.includes(props.office) ? [props.office, ...props.offices] : props.offices;
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("period")}
        <select name="period" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("period")} className={field}>
          {(["30d", "90d", "365d", "custom"] as const).map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </label>
      {period === "custom" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("from")}
            <input type="date" name="from" defaultValue={props.fromDay} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("to")}
            <input type="date" name="to" defaultValue={props.toDay} className={field} />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {t("office")}
        <select name="office" defaultValue={props.office ?? ""} aria-label={t("office")} className={field}>
          <option value="">{t("allOffices")}</option>
          {offices.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-md bg-emerald-800 px-3 py-1.5 text-sm text-white">
        {t("apply")}
      </button>
    </form>
  );
}
