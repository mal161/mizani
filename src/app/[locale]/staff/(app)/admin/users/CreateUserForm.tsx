"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createUserAction, type AdminState } from "../actions";

const field = "rounded-md border px-2 py-1.5 text-sm";

export function CreateUserForm({ path }: { path: string }) {
  const t = useTranslations("admin.users");
  const tr = useTranslations("staffNav.roles");
  const ta = useTranslations("admin");
  const [state, action, pending] = useActionState(createUserAction, {} as AdminState);
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input type="hidden" name="path" value={path} />
      <label className="flex flex-col gap-1 text-sm">
        {t("email")}
        <input name="email" type="email" required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("fullName")}
        <input name="fullName" required minLength={2} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("role")}
        <select name="role" defaultValue="staff" aria-label={t("role")} className={field}>
          {(["staff", "admin", "commissioner"] as const).map((r) => (
            <option key={r} value={r}>
              {tr(r)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("office")}
        <input name="office" required minLength={2} className={field} />
      </label>
      <button type="submit" disabled={pending} className="self-end rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {t("create")}
      </button>
      {state.tempPassword && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-2 lg:col-span-5">
          {t("created")} <code data-testid="temp-password" className="font-mono font-medium">{state.tempPassword}</code>
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 lg:col-span-5">
          {ta(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
