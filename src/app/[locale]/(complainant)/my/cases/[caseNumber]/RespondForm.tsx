"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { respondAction, type RespondState } from "./actions";

export function RespondForm({ caseId, path }: { caseId: string; path: string }) {
  const t = useTranslations("respond");
  const [state, action, pending] = useActionState(respondAction, { status: "idle" } as RespondState);
  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        {t("sent")}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="path" value={path} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("answer")}</span>
        <textarea name="text" required maxLength={5000} rows={4} className="rounded-md border px-3 py-2" />
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
      <button type="submit" disabled={pending} className="self-start rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
        {t("send")}
      </button>
    </form>
  );
}
