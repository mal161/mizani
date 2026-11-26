"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { staffLoginAction, type StaffLoginState } from "./actions";

export function StaffLoginForm() {
  const t = useTranslations("staffLogin");
  const locale = useLocale();
  const [state, action, pending] = useActionState(staffLoginAction, {} as StaffLoginState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("email")}</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className="rounded-md border px-3 py-2.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("password")}</span>
        <input name="password" type="password" autoComplete="current-password" required className="rounded-md border px-3 py-2.5" />
      </label>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t("errors.invalid")}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {t("signIn")}
      </button>
    </form>
  );
}
