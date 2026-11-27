"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { WorkflowConfig } from "@/lib/cases/workflow-config";
import type { Stage } from "@/lib/cases/stages";
import { saveSettingsAction, type AdminState } from "../actions";

const field = "rounded-md border px-2 py-1.5 text-sm";

export function SettingsForm({
  path,
  stages,
  cfg,
}: {
  path: string;
  stages: { key: Stage; defaultName: string }[];
  cfg: WorkflowConfig;
}) {
  const t = useTranslations("admin.settings");
  const ta = useTranslations("admin");
  const [state, action, pending] = useActionState(saveSettingsAction, {} as AdminState);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="path" value={path} />
      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">{t("stage")}</th>
              <th className="px-3 py-2">{t("slaDays")}</th>
              <th className="px-3 py-2">{t("labelEn")}</th>
              <th className="px-3 py-2">{t("labelSw")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stages.map(({ key, defaultName }) => (
              <tr key={key}>
                <td className="px-3 py-2">{defaultName}</td>
                <td className="px-3 py-2">
                  {key === "closed" ? (
                    "—"
                  ) : key === "advocate_notified" ? (
                    <span className="text-slate-500">{t("usesResponseDays")}</span>
                  ) : (
                    <>
                      <input
                        name={`sla_${key}`}
                        type="number"
                        min={1}
                        max={365}
                        defaultValue={cfg.slaDays[key]}
                        aria-label={t("slaFor", { stage: defaultName })}
                        className={`${field} w-20`}
                      />
                    </>
                  )}
                  {key === "advocate_notified" && <input type="hidden" name={`sla_${key}`} value={cfg.slaDays.advocate_notified} />}
                </td>
                <td className="px-3 py-2">
                  <input
                    name={`label_en_${key}`}
                    maxLength={40}
                    defaultValue={cfg.stageLabels.en[key] ?? ""}
                    placeholder={t("useDefault")}
                    aria-label={t("labelEnFor", { stage: defaultName })}
                    className={field}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    name={`label_sw_${key}`}
                    maxLength={40}
                    defaultValue={cfg.stageLabels.sw[key] ?? ""}
                    placeholder={t("useDefault")}
                    aria-label={t("labelSwFor", { stage: defaultName })}
                    className={field}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("responseDays")}
          <input name="advocateResponseDays" type="number" min={7} max={60} defaultValue={cfg.advocateResponseDays} className={`${field} w-24`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="conciliationEnabled" type="checkbox" defaultChecked={cfg.conciliationEnabled} />
          {t("conciliation")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="aiEnabled" type="checkbox" defaultChecked={cfg.aiEnabled} />
          {t("aiEnabled")}
        </label>
        <p className="text-xs text-slate-500 sm:col-span-2">{t("aiHint")}</p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {t("categories")}
        <textarea name="categories" rows={6} defaultValue={cfg.categories.join("\n")} className={`${field} font-mono`} />
        <span className="text-xs text-slate-500">{t("categoriesHint")}</span>
      </label>

      {state.ok && !state.error && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {t("saved")}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ta(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-4 py-2 text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {t("save")}
      </button>
    </form>
  );
}
