"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  scheduleHearingAction,
  endHearingAction,
  updateReferralAction,
  type HearingState,
} from "@/app/[locale]/staff/(app)/cases/[caseNumber]/hearing-actions";

const box = "flex flex-col gap-2 rounded-lg border p-4";
const btn = "self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60";
const field = "rounded-md border px-2 py-1.5 text-sm";
const REFERRAL_STATUSES = ["prepared", "lodged", "acknowledged", "concluded"] as const;

export interface ScheduledHearingView {
  id: string;
  whenLocal: string; // YYYY-MM-DDTHH:mm, Nairobi
  whenLabel: string;
  duration: number;
  mode: "in_person" | "online";
  venue: string | null;
  link: string | null;
  panel: string[];
}

function Err({ state }: { state: HearingState }) {
  const t = useTranslations("hearingPanel");
  if (!state.error || state.error === "clash") return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {t(`errors.${state.error}`)}
    </p>
  );
}

export function HearingPanel(props: {
  caseId: string;
  path: string;
  canWrite: boolean;
  canSchedule: boolean;
  scheduled: ScheduledHearingView | null;
  history: { id: string; whenLabel: string; status: string }[];
  members: { id: string; name: string }[];
  bundleHref: string;
  decision: { outcomeLabel: string; letterHref: string } | null;
  referral: { id: string; status: string; reference: string | null; packHref: string } | null;
}) {
  const t = useTranslations("hearingPanel");
  const tStatus = useTranslations("commission.hearing.status");
  const tRef = useTranslations("commission.referral.statuses");
  const [sched, schedAct, schedPending] = useActionState(scheduleHearingAction, {});
  const [end, endAct, endPending] = useActionState(endHearingAction, {});
  const [ref, refAct, refPending] = useActionState(updateReferralAction, {});
  const s = props.scheduled;
  const v = sched.values ?? {};
  const val = (k: string, fallback: string) => (typeof v[k] === "string" ? (v[k] as string) : fallback);
  const [mode, setMode] = useState<string>(val("mode", s?.mode ?? "in_person"));
  const panel = Array.isArray(v.panel) ? v.panel : (s?.panel ?? []);
  const names = new Map(props.members.map((m) => [m.id, m.name]));
  const hidden = (
    <>
      <input type="hidden" name="caseId" value={props.caseId} />
      <input type="hidden" name="path" value={props.path} />
    </>
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <a href={props.bundleHref} className="text-sm underline">
        {t("downloadBundle")}
      </a>

      {s && (
        <div data-testid="scheduled-hearing" className="rounded-md bg-sky-50 p-3 text-sm">
          <p className="font-medium">{s.whenLabel}</p>
          <p>
            {s.mode === "online" ? `${t("online")} · ${s.link ?? ""}` : s.venue} · {t("minutesLong", { minutes: s.duration })}
          </p>
          <p className="text-xs text-slate-600">
            {t("panel")}: {s.panel.map((p) => names.get(p) ?? "—").join(", ")}
          </p>
        </div>
      )}
      {props.history.length > 0 && (
        <ul className="text-xs text-slate-600">
          {props.history.map((h) => (
            <li key={h.id}>
              {h.whenLabel} · {tStatus(h.status)}
            </li>
          ))}
        </ul>
      )}

      {props.canWrite && props.canSchedule && (
        <form action={schedAct} key={sched.at ?? 0} className={box}>
          {hidden}
          {s && <input type="hidden" name="hearingId" value={s.id} />}
          <h3 className="font-semibold">{s ? t("reschedule") : t("schedule")}</h3>
          <label className="flex flex-col gap-1 text-sm">
            {t("when")}
            <input type="datetime-local" name="when" required defaultValue={val("when", s?.whenLocal ?? "")} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("duration")}
            <select name="duration" defaultValue={val("duration", String(s?.duration ?? 60))} aria-label={t("duration")} className={field}>
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {t("minutesLong", { minutes: m })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("format")}
            <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t("format")} className={field}>
              <option value="in_person">{t("inPerson")}</option>
              <option value="online">{t("online")}</option>
            </select>
          </label>
          {mode === "online" ? (
            <label className="flex flex-col gap-1 text-sm">
              {t("link")}
              <input type="url" name="onlineLink" required placeholder="https://" defaultValue={val("onlineLink", s?.link ?? "")} className={field} />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              {t("venue")}
              <input name="venue" required defaultValue={val("venue", s?.venue ?? "")} className={field} />
            </label>
          )}
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend>{t("panel")}</legend>
            {props.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input type="checkbox" name="panel" value={m.id} defaultChecked={panel.includes(m.id)} />
                {m.name}
              </label>
            ))}
          </fieldset>
          {sched.error === "clash" && (
            <div data-testid="clash-alert" className="flex flex-col gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p>{t("clash", { cases: (sched.clashes ?? []).join(", ") })}</p>
              <button type="submit" name="confirmClash" value="1" disabled={schedPending} className={btn}>
                {t("scheduleAnyway")}
              </button>
            </div>
          )}
          <Err state={sched} />
          {sched.ok && <p className="text-sm text-emerald-700">{t("saved")}</p>}
          <button type="submit" disabled={schedPending} className={btn}>
            {s ? t("saveReschedule") : t("schedule")}
          </button>
          <p className="text-xs text-slate-500">{t("smsNote")}</p>
        </form>
      )}

      {props.canWrite && s && (
        <form action={endAct} key={`end-${end.at ?? 0}`} className={box}>
          {hidden}
          <input type="hidden" name="hearingId" value={s.id} />
          <h3 className="font-semibold">{t("endTitle")}</h3>
          <label className="flex flex-col gap-1 text-sm">
            {t("reason")}
            <input name="reason" required minLength={3} defaultValue={typeof end.values?.reason === "string" ? end.values.reason : ""} className={field} />
          </label>
          <p className="text-xs text-slate-500">{t("reasonHint")}</p>
          <Err state={end} />
          <div className="flex gap-2">
            <button type="submit" name="kind" value="adjourn" disabled={endPending} className={btn}>
              {t("adjourn")}
            </button>
            <button type="submit" name="kind" value="cancel" disabled={endPending} className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60">
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      {props.decision && (
        <div className="flex flex-col gap-1 rounded-md bg-emerald-50 p-3 text-sm">
          <p className="font-medium">
            {t("decision")}: {props.decision.outcomeLabel}
          </p>
          <a href={props.decision.letterHref} className="underline">
            {t("downloadLetter")}
          </a>
        </div>
      )}

      {props.referral && (
        <div data-testid="referral" className={box}>
          <h3 className="font-semibold">{t("referralTitle")}</h3>
          <p className="text-sm">
            {tRef(props.referral.status)}
            {props.referral.reference ? ` · ${props.referral.reference}` : ""}
          </p>
          <a href={props.referral.packHref} className="text-sm underline">
            {t("downloadPack")}
          </a>
          {props.canWrite && (
            <form action={refAct} className="flex flex-col gap-2">
              {hidden}
              <input type="hidden" name="referralId" value={props.referral.id} />
              <label className="flex flex-col gap-1 text-sm">
                {t("referralStatus")}
                <select name="status" defaultValue={props.referral.status} aria-label={t("referralStatus")} className={field}>
                  {REFERRAL_STATUSES.map((r) => (
                    <option key={r} value={r}>
                      {tRef(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("tribunalReference")}
                <input name="tribunalReference" maxLength={80} defaultValue={props.referral.reference ?? ""} className={field} />
              </label>
              <Err state={ref} />
              <button type="submit" disabled={refPending} className={btn}>
                {t("saveReferral")}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
