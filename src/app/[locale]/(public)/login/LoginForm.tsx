"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { step: "phone", phone: "" };

export function LoginForm() {
  const t = useTranslations("login");
  const locale = useLocale();
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("phone")}</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          defaultValue={state.phone}
          readOnly={state.step === "code"}
          placeholder="07XX XXX XXX"
          className="rounded-md border px-3 py-2"
        />
      </label>

      {state.step === "code" && (
        <>
          <p className="text-sm text-slate-600">{t("codeSent")}</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("code")}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className="rounded-md border px-3 py-2 tracking-widest"
            />
          </label>
        </>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <button
        type="submit"
        name="intent"
        value={state.step === "phone" ? "send" : "verify"}
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {state.step === "phone" ? t("sendCode") : t("signIn")}
      </button>
    </form>
  );
}
