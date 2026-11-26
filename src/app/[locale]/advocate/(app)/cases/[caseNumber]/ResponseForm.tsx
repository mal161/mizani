"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { advocateRespondAction, type AdvocateResponseState } from "./actions";

export function ResponseForm({ caseId }: { caseId: string }) {
  const t = useTranslations("advocatePortal.respond");
  const [state, action, pending] = useActionState(advocateRespondAction, { status: "idle" } as AdvocateResponseState);
  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.late ? t("sentLate") : t("sent")}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("text")}</span>
        <textarea name="text" required minLength={20} maxLength={20000} rows={8} className="rounded-md border px-3 py-2.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("attach")}</span>
        <input name="evidence" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="text-sm" />
      </label>
      {state.status === "error" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.reason ?? "server"}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {t("send")}
      </button>
    </form>
  );
}
