import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireAdvocate } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/server";
import { caseNumberFromSlug } from "@/lib/cases/case-number";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { labelFor } from "@/lib/cases/workflow-config";
import { logAudit } from "@/lib/audit";
import { StageBadge } from "@/components/case/StageBadge";
import { Timeline, type TimelineEvent } from "@/components/case/Timeline";
import { Link, type Locale } from "@/i18n/routing";
import { ResponseForm } from "./ResponseForm";
import { HearingAndDecision } from "@/components/case/HearingAndDecision";

export default async function AdvocateCasePage({ params }: { params: Promise<{ locale: string; caseNumber: string }> }) {
  const p = await params;
  const locale = p.locale as Locale;
  const user = await requireAdvocate(locale);
  const caseNumber = caseNumberFromSlug(p.caseNumber);
  if (!caseNumber) notFound();

  const supabase = await createServerClient();
  // RLS-scoped view: nothing comes back for a case that isn't this advocate's notified case.
  const { data: c } = await supabase.from("advocate_cases").select("*").eq("case_number", caseNumber).maybeSingle();
  if (!c) notFound();
  await logAudit({ actorId: user.id, channel: "web", action: "view", entity: "cases", entityId: c.id });

  const [{ data: events }, { data: docs }, { data: responses }, cfg] = await Promise.all([
    supabase.from("case_events").select("id,type,created_at,body").eq("case_id", c.id).order("created_at"),
    supabase.from("documents").select("id,file_name,uploaded_by").eq("case_id", c.id).order("created_at"),
    supabase.from("advocate_responses").select("id,text,late,created_at").eq("case_id", c.id).order("created_at"),
    loadWorkflowConfig(),
  ]);
  const t = await getTranslations("advocatePortal");
  const tStages = await getTranslations("stages");
  const format = await getFormatter();
  const stageName = (s: string) => labelFor(s, locale, cfg, (k) => tStages(k));
  const due = c.response_due ? new Date(c.response_due) : null;
  const evidence = (docs ?? []).filter((d) => d.uploaded_by !== user.id);
  const mine = (docs ?? []).filter((d) => d.uploaded_by === user.id);
  const fmt = (d: string | Date) => format.dateTime(new Date(d), { dateStyle: "medium", timeZone: "Africa/Nairobi" });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/advocate" className="text-sm underline">
        ← {t("title")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{c.case_number}</h1>
        <StageBadge stage={c.stage} label={stageName(c.stage)} />
      </div>
      <HearingAndDecision caseId={c.id} />
      {due && (
        <p className={`rounded-md px-3 py-2 text-sm ${due.getTime() < Date.now() && !responses?.length ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          {t("deadline", { date: fmt(due), served: c.advocate_served_on ? fmt(c.advocate_served_on) : "—" })}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("allegations")}</h2>
        <p className="text-sm text-slate-500">{t("complainant", { name: c.complainant_name ?? "—" })}</p>
        <p className="font-medium">{c.summary}</p>
        <p className="whitespace-pre-wrap text-slate-700">{c.description}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("documents")}</h2>
        {evidence.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noDocuments")}</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {evidence.map((d) => (
              <li key={d.id}>
                <a href={`/api/documents/${d.id}`} className="underline">
                  {d.file_name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("respond.title")}</h2>
        {(responses ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
            <p className="text-xs text-slate-500">
              {fmt(r.created_at)}
              {r.late ? ` · ${t("respond.late")}` : ""}
            </p>
            <p className="whitespace-pre-wrap">{r.text}</p>
          </div>
        ))}
        {mine.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {mine.map((d) => (
              <li key={d.id}>
                <a href={`/api/documents/${d.id}`} className="underline">
                  {d.file_name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <ResponseForm caseId={c.id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("timeline")}</h2>
        <Timeline events={(events ?? []) as TimelineEvent[]} stageName={stageName} />
      </section>
    </main>
  );
}
