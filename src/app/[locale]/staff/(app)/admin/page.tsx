import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { Link, type Locale } from "@/i18n/routing";

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  await requireStaff((await params).locale as Locale, ["admin"]);
  const t = await getTranslations("admin");
  const items = ["users", "settings", "routing", "audit"] as const;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((k) => (
          <li key={k}>
            <Link href={`/staff/admin/${k}`} className="block rounded-lg border p-4 hover:bg-slate-50">
              <p className="font-semibold">{t(`${k}.title`)}</p>
              <p className="text-sm text-slate-600">{t(`${k}.intro`)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
