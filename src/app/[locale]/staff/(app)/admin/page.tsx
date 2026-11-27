import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { Link, type Locale } from "@/i18n/routing";

export default async function AdminHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await requireStaff((await params).locale as Locale, ["admin"]);
  const t = await getTranslations("admin");
  // [message key, path]
  const items = [
    ["users", "users"],
    ["settings", "settings"],
    ["routing", "routing"],
    ["audit", "audit"],
    ["smsInbox", "sms-inbox"],
  ] as const;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(([k, path]) => (
          <li key={k}>
            <Link
              href={`/staff/admin/${path}`}
              className="block rounded-lg border p-4 hover:bg-slate-50"
            >
              <p className="font-medium">{t(`${k}.title`)}</p>
              <p className="text-sm text-slate-600">{t(`${k}.intro`)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
