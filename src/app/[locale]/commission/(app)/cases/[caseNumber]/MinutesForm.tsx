"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordMinutesAction } from "./actions";

export function MinutesForm({ hearingId, path, current }: { hearingId: string; path: string; current: string | null }) {
  const t = useTranslations("commission");
  const [state, act, pending] = useActionState(recordMinutesAction, {});
  const value = typeof state.values?.minutes === "string" ? state.values.minutes : (current ?? "");
  return (
    <form action={act} className="flex flex-col gap-2 rounded-lg border p-4">
      <input type="hidden" name="hearingId" value={hearingId} />
      <input type="hidden" name="path" value={path} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("minutes.label")}
        <textarea key={state.at ?? 0} name="minutes" rows={6} required minLength={10} defaultValue={value} className="rounded-md border px-2 py-1.5 font-normal" />
      </label>
      <p className="text-xs text-slate-500">{t("minutes.hint")}</p>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-accent px-3 py-1.5 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
        {t("minutes.save")}
      </button>
    </form>
  );
}
