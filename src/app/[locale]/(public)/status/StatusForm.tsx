"use client";

import { useActionState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { isStage } from "@/lib/cases/stages";
import { StageTrack } from "@/components/case/StageTrack";
import { statusAction, type StatusState } from "./actions";

/**
 * Public status check by case number + PIN. The result says where the case is, since when, what that stage means,
 * and whether the complainant needs to act — never names, complaint text or decision details (those need sign-in).
 */
export function StatusForm() {
  const t = useTranslations("status");
  const ts = useTranslations("stages");
  const tTrack = useTranslations("caseTrack");
  const format = useFormatter();
  const locale = useLocale();
  const [state, action, pending] = useActionState(statusAction, { status: "idle" } as StatusState);

  const found = state.status === "found" ? state : null;
  const stageName = (s: string) => (found && isStage(s) && found.labels[s]) || (isStage(s) ? ts(s) : s);
  const notices = found
    ? [
        found.actions.infoRequested && { key: "info", text: t("actions.info"), link: t("actions.reply") },
        found.actions.hearingScheduled && { key: "hearing", text: t("actions.hearing"), link: null },
        found.actions.decisionIssued && { key: "decision", text: t("actions.decision"), link: t("actions.read") },
      ].filter((n): n is { key: string; text: string; link: string | null } => Boolean(n))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("caseNumber")}</span>
          <input name="caseNumber" required placeholder="ACC/2026/000123" className="rounded-md border px-3 py-2.5 font-mono" />
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
            className="rounded-md border px-3 py-2.5 tracking-widest"
          />
        </label>
        <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
          {t("check")}
        </button>
      </form>

      {found && (
        <section className="flex flex-col gap-5 border-t pt-6" aria-live="polite" aria-labelledby="status-result">
          <div className="flex flex-col gap-1">
            <h2 id="status-result" className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="case-stamp text-sm">{found.caseNumber}</span>
            </h2>
            <p className="text-xl font-medium text-primary">
              <span className="sr-only">{t("currentStage")}: </span>
              <span data-testid="status-stage">{stageName(found.stage)}</span>
            </p>
            <p className="text-sm text-slate-600">
              {t("inStageSince", { date: format.dateTime(new Date(found.stageSince), { dateStyle: "long", timeZone: "Africa/Nairobi" }) })}
            </p>
          </div>

          <p data-testid="status-explain" className="text-base leading-7 text-slate-700">
            {t(`explain.${found.stage}`)} {found.stage !== "closed" && t("smsNote")}
          </p>

          {notices.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label={t("actions.title")}>
              {notices.map((n) => (
                <li key={n.key} data-testid={`status-action-${n.key}`} className="rounded-md border border-accent bg-accent-soft px-4 py-3 text-sm leading-6 text-slate-900">
                  {n.text}{" "}
                  {n.link && (
                    <Link href="/login" className="font-medium text-primary underline underline-offset-2">
                      {n.link}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          <StageTrack vertical current={found.stage} title={tTrack("title")} nowLabel={tTrack("now")} label={stageName} />
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
