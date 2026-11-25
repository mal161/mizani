import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { caseNumberFromSlug } from "@/lib/cases/case-number";
import { logAudit } from "@/lib/audit";
import { StageBadge } from "@/components/case/StageBadge";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { isStage } from "@/lib/cases/stages";
import { Timeline, type TimelineEvent } from "@/components/case/Timeline";
import { Link, type Locale } from "@/i18n/routing";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; caseNumber: string }>;
}) {
  const { locale, caseNumber: slug } = await params;
  const user = await requireComplainant(locale);
  const caseNumber = caseNumberFromSlug(slug);
  if (!caseNumber) notFound();

  const supabase = await createServerClient();
  // RLS-scoped: returns nothing for someone else's case.
  const { data: c } = await supabase
    .from("my_cases")
    .select("id,case_number,summary,description,advocate_name_given,stage,created_at")
    .eq("case_number", caseNumber)
    .maybeSingle();
  if (!c) notFound();

  await logAudit({ actorId: user.id, channel: "web", action: "view", entity: "cases", entityId: c.id });

  const [{ data: events }, { data: docs }] = await Promise.all([
    supabase.from("case_events").select("id,type,created_at,body").eq("case_id", c.id).order("created_at"),
    supabase.from("documents").select("id,file_name,storage_path").eq("case_id", c.id).order("created_at"),
  ]);

  // Documents already passed RLS; sign short-lived links server-side.
  const admin = createAdminClient();
  const links = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await admin.storage.from("evidence").createSignedUrl(d.storage_path, 60, { download: d.file_name });
      return { id: d.id, name: d.file_name, url: data?.signedUrl };
    }),
  );

  const t = await getTranslations("caseDetail");
  const stageOverrides = (await loadWorkflowConfig()).stageLabels[locale] ?? {};
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Link href="/my/cases" className="text-sm underline">
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{c.case_number}</h1>
        <StageBadge stage={c.stage} label={isStage(c.stage) ? stageOverrides[c.stage] : undefined} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("complaint")}</h2>
        <p className="text-sm text-slate-500">{t("against", { name: c.advocate_name_given })}</p>
        <p className="font-medium">{c.summary}</p>
        <p className="whitespace-pre-wrap text-slate-700">{c.description}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("documents")}</h2>
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noDocuments")}</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {links.map((l) => (
              <li key={l.id}>{l.url ? <a href={l.url} className="underline">{l.name}</a> : l.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("timeline")}</h2>
        <Timeline events={(events ?? []) as TimelineEvent[]} />
      </section>
    </main>
  );
}
