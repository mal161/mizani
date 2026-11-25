"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fileComplaintAction, type FileState } from "./actions";
import { AdvocatePicker } from "@/components/complaint/AdvocatePicker";

const initial: FileState = { status: "idle" };

export function ComplaintForm() {
  const t = useTranslations("file");
  const locale = useLocale();
  const [state, action, pending] = useActionState(fileComplaintAction, initial);

  if (state.status === "filed") {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-green-200 bg-green-50 p-6">
        <h2 className="text-xl font-semibold">{t("success.title")}</h2>
        <p>{t("success.body")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-medium">{t("success.caseNumber")}</dt>
          <dd data-testid="case-number" className="font-mono">{state.caseNumber}</dd>
          <dt className="font-medium">{t("success.pin")}</dt>
          <dd data-testid="case-pin" className="font-mono text-lg">{state.pin}</dd>
        </dl>
        <p className="text-sm text-slate-700">{t("success.pinWarning")}</p>
        <Link href="/my/cases" className="self-start rounded-md bg-slate-900 px-4 py-2 text-white">
          {t("success.viewCases")}
        </Link>
      </section>
    );
  }

  const err = state.status === "error" ? state : null;
  const v = err?.values;
  const bad = (f: string) => err?.fields.includes(f) ?? false;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      {err && (
        <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{t(`errors.${err.reason}`)}</p>
          {err.fields.length > 0 && (
            <ul className="list-disc pl-5">
              {err.fields.map((f) => (
                <li key={f}>{t(`fieldErrors.${f}`)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AdvocatePicker defaultName={v?.advocateNameGiven} invalid={bad("advocateNameGiven")} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("summary")}</span>
        <input
          name="summary"
          defaultValue={v?.summary}
          required
          maxLength={200}
          aria-invalid={bad("summary")}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("description")}</span>
        <textarea
          name="description"
          defaultValue={v?.description}
          required
          rows={7}
          maxLength={10000}
          aria-invalid={bad("description")}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("evidence")}</span>
        <input
          name="evidence"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm"
        />
        <span className="text-xs text-slate-500">{t("evidenceHint")}</span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>{t("consent")}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
