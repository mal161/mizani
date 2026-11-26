"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { activateAction, type ActivateState } from "./actions";

const field = "rounded-md border px-3 py-2";

export function ActivateForm() {
  const t = useTranslations("advocatePortal.activate");
  const locale = useLocale();
  const [state, action, pending] = useActionState(activateAction, { step: "start", admissionNo: "", phone: "" } as ActivateState);
  const verifying = state.step === "verify";
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intent" value={verifying ? "verify" : "start"} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("admissionNo")}</span>
        <input name="admissionNo" required defaultValue={state.admissionNo} readOnly={verifying} placeholder="P.105/1234/2010" className={field} />
      </label>
      {!verifying && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("code")}</span>
          <input name="code" required autoComplete="off" placeholder="ABCD2345" className={`${field} font-mono uppercase tracking-widest`} />
          <span className="text-xs text-slate-500">{t("codeHint")}</span>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("phone")}</span>
        <input name="phone" type="tel" required defaultValue={state.phone} readOnly={verifying} placeholder="07XX XXX XXX" className={field} />
      </label>
      {verifying && (
        <>
          <p className="text-sm text-slate-600">{t("smsSent")}</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("smsCode")}</span>
            <input name="smsCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={`${field} tracking-widest`} />
          </label>
        </>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
        {verifying ? t("finish") : t("continue")}
      </button>
    </form>
  );
}
