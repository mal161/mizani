"use client";

import { useActionState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { statusAction, type StatusState } from "./actions";

export function StatusForm() {
  const t = useTranslations("status");
  const ts = useTranslations("stages");
  const format = useFormatter();
  const locale = useLocale();
  const [state, action, pending] = useActionState(statusAction, { status: "idle" } as StatusState);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("caseNumber")}</span>
          <input name="caseNumber" required placeholder="ACC/2026/000123" className="rounded-md border px-3 py-2 font-mono" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">PIN</span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="off"
            className="rounded-md border px-3 py-2 tracking-widest"
          />
        </label>
        <button type="submit" disabled={pending} className="self-start rounded-md bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
          {t("check")}
        </button>
      </form>

      {state.status === "found" && (
        <section className="rounded-lg border bg-slate-50 p-4" aria-live="polite">
          <p className="font-mono text-sm">{state.caseNumber}</p>
          <p className="text-lg">
            {t("currentStage")}: <strong data-testid="status-stage">{state.label ?? ts(state.stage)}</strong>
          </p>
          <p className="text-xs text-slate-500">
            {t("updated", {
              date: format.dateTime(new Date(state.updatedAt), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }),
            })}
          </p>
        </section>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.reason}`)}
        </p>
      )}
    </div>
  );
}
