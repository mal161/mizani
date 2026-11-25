"use client";

import { useActionState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AdvocatePicker } from "@/components/complaint/AdvocatePicker";
import { walkInAction, type IntakeState } from "./actions";

const field = "rounded-md border px-3 py-2";

export function IntakeForm({ statusUrl }: { statusUrl: string }) {
  const t = useTranslations("intake");
  const tf = useTranslations("file");
  const locale = useLocale();
  const format = useFormatter();
  const [state, action, pending] = useActionState(walkInAction, { status: "idle" } as IntakeState);

  if (state.status === "filed") {
    return (
      <section className="slip flex flex-col gap-4 rounded-lg border-2 border-slate-900 p-6">
        <h2 className="text-xl font-bold">{t("slip.title")}</h2>
        <p className="text-sm">{t("slip.org")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-medium">{t("slip.caseNumber")}</dt>
          <dd data-testid="slip-case-number" className="font-mono text-lg">{state.caseNumber}</dd>
          <dt className="font-medium">{t("slip.pin")}</dt>
          <dd data-testid="slip-pin" className="font-mono text-2xl tracking-widest">{state.pin}</dd>
          <dt className="font-medium">{t("slip.office")}</dt>
          <dd>{state.office ?? "—"}</dd>
          <dt className="font-medium">{t("slip.date")}</dt>
          <dd>{format.dateTime(new Date(state.filedAt), { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Nairobi" })}</dd>
        </dl>
        <p className="text-sm">{t("slip.howToCheck", { url: statusUrl })}</p>
        <p className="text-sm font-medium">{t("slip.keepPin")}</p>
        <div className="no-print flex gap-3">
          <button type="button" onClick={() => window.print()} className="rounded-md bg-slate-900 px-4 py-2 text-white">
            {t("slip.print")}
          </button>
          <a href={`/${locale}/staff/intake`} className="rounded-md border px-4 py-2">
            {t("slip.another")}
          </a>
        </div>
      </section>
    );
  }

  const err = state.status === "error" ? state : null;
  const v = err?.values;
  return (
    <form action={action} className="flex flex-col gap-5">
      {err && (
        <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{t(`errors.${err.reason}`)}</p>
          {err.fields.length > 0 && (
            <ul className="list-disc pl-5">
              {err.fields.map((f) => (
                <li key={f}>{t.has(`fieldErrors.${f}`) ? t(`fieldErrors.${f}`) : tf(`fieldErrors.${f}`)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 font-semibold">{t("person")}</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("fullName")}</span>
          <input name="fullName" required defaultValue={v?.fullName} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("phone")}</span>
          <input name="phone" type="tel" defaultValue={v?.phone} placeholder="07XX XXX XXX" className={field} />
          <span className="text-xs text-slate-500">{t("phoneHint")}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("language")}</span>
          <select name="language" defaultValue={v?.language ?? locale} className={field}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 font-semibold">{t("complaint")}</legend>
        <AdvocatePicker defaultName={v?.advocateNameGiven} />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{tf("summary")}</span>
          <input name="summary" required maxLength={200} defaultValue={v?.summary} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{tf("description")}</span>
          <textarea name="description" required rows={6} maxLength={10000} defaultValue={v?.description} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("evidence")}</span>
          <input name="evidence" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="text-sm" />
          <span className="text-xs text-slate-500">{tf("evidenceHint")}</span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>{t("consent")}</span>
      </label>
      <button type="submit" disabled={pending} className="self-start rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
        {pending ? tf("submitting") : t("submit")}
      </button>
    </form>
  );
}
