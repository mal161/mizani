import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { listStaffUsersAs } from "@/lib/admin/users";
import { STAFF_ROLES } from "@/lib/auth/staff-gate";
import type { Locale } from "@/i18n/routing";
import { setActiveAction, changeRoleAction } from "../actions";
import { CreateUserForm } from "./CreateUserForm";

export default async function UsersAdmin({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const me = await requireStaff(locale, ["admin"]);
  const t = await getTranslations("admin.users");
  const tr = await getTranslations("staffNav.roles");
  const users = await listStaffUsersAs(me);
  const path = `/${locale}/staff/admin/users`;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <CreateUserForm path={path} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{t("name")}</th>
              <th className="px-3 py-2">{t("email")}</th>
              <th className="px-3 py-2">{t("office")}</th>
              <th className="px-3 py-2">{t("role")}</th>
              <th className="px-3 py-2">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <td className="px-3 py-2">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2">{u.email ?? "—"}</td>
                <td className="px-3 py-2">{u.office ?? "—"}</td>
                <td className="px-3 py-2">
                  {u.id === me.id ? (
                    tr(u.role)
                  ) : (
                    <form action={changeRoleAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="path" value={path} />
                      <select name="role" defaultValue={u.role} aria-label={t("roleFor", { name: u.full_name ?? "" })} className="rounded border px-1 py-0.5">
                        {STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {tr(r)}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded border px-2">
                        {t("save")}
                      </button>
                    </form>
                  )}
                </td>
                <td className="px-3 py-2">
                  {u.id === me.id ? (
                    t("active")
                  ) : (
                    <form action={setActiveAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="path" value={path} />
                      <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                      <button type="submit" className="rounded border px-2">
                        {u.active ? t("deactivate") : t("reactivate")}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
