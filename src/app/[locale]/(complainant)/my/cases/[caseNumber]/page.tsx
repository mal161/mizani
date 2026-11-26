import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireComplainant } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { caseNumberFromSlug } from "@/lib/cases/case-number";
import { logAudit } from "@/lib/audit";
import { StageBadge } from "@/components/case/StageBadge";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { isStage } from "@/lib/cases/stages";
import { Timeline, type TimelineEvent } from "@/components/case/Timeline";
import { Link, type Locale } from "@/i18n/routing";
import { openInfoRequest } from "@/lib/cases/respond";
import { caseSlug } from "@/lib/cases/case-number";
import { RespondForm } from "./RespondForm";
import { HearingAndDecision } from "@/components/case/HearingAndDecision";
import { CaseStamp } from "@/components/case/CaseStamp";
import { StageTrack } from "@/components/case/StageTrack";

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
    supabase.from("documents").select("id,file_name").eq("case_id", c.id).order("created_at"),
  ]);

  // Downloads go through /api/documents/[id], which re-checks access and audits the download.
  const links = (docs ?? []).map((d) => ({ id: d.id as string, name: d.file_name as string }));

  const t = await getTranslations("caseDetail");
  const stageOverrides = (await loadWorkflowConfig()).stageLabels[locale] ?? {};
  const tStages = await getTranslations("stages");
  const tr = await getTranslations("respond");
  const request = await openInfoRequest(c.id);
  const tTrack = await getTranslations("caseTrack");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Link href="/my/cases" className="text-sm underline">
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1>
          <CaseStamp number={c.case_number} size="lg" />
        </h1>
        <StageBadge stage={c.stage} label={isStage(c.stage) ? stageOverrides[c.stage] : undefined} />
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-4 text-sm text-slate-600">{tTrack("title")}</h2>
        <StageTrack
          current={c.stage}
          title={tTrack("title")}
          nowLabel={tTrack("now")}
          label={(s) => (isStage(s) ? stageOverrides[s] ?? tStages(s) : s)}
        />
      </section>

      <HearingAndDecision caseId={c.id} />

      {request && (
        <section className="flex flex-col gap-3 rounded-lg border border-accent bg-accent-soft p-5">
          <h2 className="text-xl font-medium text-primary">{tr("title")}</h2>
          <p className="whitespace-pre-wrap">{request.message}</p>
          <RespondForm caseId={c.id} path={`/${locale}/my/cases/${caseSlug(c.case_number)}`} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium text-primary">{t("complaint")}</h2>
        <p className="text-sm text-slate-500">{t("against", { name: c.advocate_name_given })}</p>
        <p className="font-medium">{c.summary}</p>
        <p className="whitespace-pre-wrap text-slate-700">{c.description}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium text-primary">{t("documents")}</h2>
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noDocuments")}</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {links.map((l) => (
              <li key={l.id}>
                <a href={`/api/documents/${l.id}`} className="underline">
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-medium text-primary">{t("timeline")}</h2>
        <Timeline
          events={(events ?? []) as TimelineEvent[]}
          stageName={(s) => (isStage(s) ? stageOverrides[s] ?? tStages(s) : s)}
        />
      </section>
    </main>
  );
}
