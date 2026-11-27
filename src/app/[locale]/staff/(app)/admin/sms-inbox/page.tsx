import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { listTestSmsAs } from "@/lib/sms/test-inbox";
import { logAudit } from "@/lib/audit";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Test SMS inbox (administrators): what Mizani would have texted while SMS is in test mode, newest first, so
 * sign-in codes and PINs can be read without a real SMS provider. Empty and explained once real SMS is on.
 */
export default async function SmsInbox({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as Locale;
  const user = await requireStaff(locale, ["admin"]);
  const view = await listTestSmsAs(user);
  await logAudit({
    actorId: user.id,
    channel: "web",
    action: "view_test_sms",
    entity: "test_sms_outbox",
    entityId: "*",
    details: { shown: view.rows.length },
  });
  const t = await getTranslations("admin.smsInbox");
  const format = await getFormatter();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Nairobi",
    });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
        <p className="max-w-[70ch] text-sm text-slate-600">{t("intro")}</p>
      </div>

      {view.live ? (
        <p className="rounded-md border bg-white p-4 text-sm">{t("live")}</p>
      ) : (
        <>
          <p className="rounded-md bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            {view.enabled ? t("warning") : t("off")}
          </p>
          {view.rows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 font-medium whitespace-nowrap"
                    >
                      {t("head.when")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("head.to")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("head.message")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {view.rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                        {when(r.created_at)}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                        {r.to_phone}
                      </td>
                      <td className="px-3 py-2">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
