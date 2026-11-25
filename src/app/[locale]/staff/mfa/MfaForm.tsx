"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { verifyMfaAction, type MfaState } from "./actions";

export function MfaForm({ factorId }: { factorId: string }) {
  const t = useTranslations("mfa");
  const locale = useLocale();
  const [state, action, pending] = useActionState(verifyMfaAction, {} as MfaState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="factorId" value={factorId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("code")}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          className="rounded-md border px-3 py-2 tracking-widest"
        />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("errors.invalid_code")}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
        {t("verify")}
      </button>
    </form>
  );
}
