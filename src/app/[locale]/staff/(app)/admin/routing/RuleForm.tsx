"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveRuleAction, type AdminState } from "../actions";

type Option = { value: string; label: string };
const field = "rounded-md border px-2 py-1.5 text-sm";

export function RuleForm({ path, categories, officers }: { path: string; categories: Option[]; officers: Option[] }) {
  const t = useTranslations("admin.routing");
  const tPri = useTranslations("staffCases.priorities");
  const ta = useTranslations("admin");
  const [state, action, pending] = useActionState(saveRuleAction, {} as AdminState);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4" key={state.at}>
      <input type="hidden" name="path" value={path} />
      <h2 className="font-medium">{t("addTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("position")}
          <input name="position" type="number" defaultValue={100} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("category")}
          <select name="category" defaultValue="" aria-label={t("category")} className={field}>
            <option value="">{t("any")}</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("priority")}
          <select name="priority" defaultValue="" aria-label={t("priority")} className={field}>
            <option value="">{t("any")}</option>
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {tPri(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("office")}
          <input name="office" placeholder={t("any")} className={field} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm">{t("officers")}</legend>
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded border p-2 text-sm sm:grid-cols-2">
          {officers.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="checkbox" name="officerIds" value={o.value} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ta(`errors.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {t("add")}
      </button>
    </form>
  );
}
