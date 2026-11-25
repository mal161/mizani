import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { caseSlug } from "@/lib/cases/case-number";
import { Link, type Locale } from "@/i18n/routing";

/** Lists the user's latest notifications; opening the page marks them read. */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id,kind,created_at,read_at,case_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const caseIds = [...new Set((data ?? []).map((n) => n.case_id).filter(Boolean))];
  const { data: cases } = caseIds.length
    ? await supabase.from("staff_cases").select("id,case_number,summary").in("id", caseIds)
    : { data: [] as { id: string; case_number: string; summary: string }[] };
  const byId = new Map((cases ?? []).map((c) => [c.id, c]));
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {!data?.length ? (
        <p className="text-slate-500">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.map((n) => {
            const c = n.case_id ? byId.get(n.case_id) : undefined;
            return (
              <li key={n.id} className={`flex flex-col gap-0.5 p-3 ${n.read_at ? "" : "bg-amber-50"}`}>
                <p className="font-medium">{t(`kinds.${n.kind}`)}</p>
                {c && (
                  <Link href={`/staff/cases/${caseSlug(c.case_number)}`} className="text-sm underline">
                    {c.case_number} · {c.summary}
                  </Link>
                )}
                <time className="text-xs text-slate-500">
                  {format.dateTime(new Date(n.created_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
