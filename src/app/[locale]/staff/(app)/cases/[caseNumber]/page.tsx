import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { caseNumberFromSlug, caseSlug } from "@/lib/cases/case-number";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { allowedNextStages, labelFor } from "@/lib/cases/workflow-config";
import { isStage } from "@/lib/cases/stages";
import { logAudit } from "@/lib/audit";
import { StageBadge } from "@/components/case/StageBadge";
import { Timeline, type TimelineEvent } from "@/components/case/Timeline";
import { Link, type Locale } from "@/i18n/routing";
import { CaseActions } from "./CaseActions";
import { latestAi } from "@/lib/ai/triage";
import { getAiProvider } from "@/lib/ai";
import { caseFlags } from "@/lib/cases/flags";
import { AiPanel, type AiTriageView, type AiSummaryView } from "@/components/staff/AiPanel";
import { FlagsPanel } from "@/components/staff/FlagsPanel";
import { AdvocatePanel } from "@/components/staff/AdvocatePanel";
import { createAdminClient } from "@/lib/supabase/admin";
import { HearingPanel } from "@/components/staff/HearingPanel";
import { caseHearings, nairobiWhen } from "@/lib/commission/hearings";
import { currentDecision } from "@/lib/commission/decisions";
import { panelMembers } from "@/lib/commission/portal";

export default async function StaffCasePage({ params }: { params: Promise<{ locale: Locale; caseNumber: string }> }) {
  const { locale, caseNumber: slug } = await params;
  const user = await requireStaff(locale);
  const caseNumber = caseNumberFromSlug(slug);
  if (!caseNumber) notFound();

  const supabase = await createServerClient();
  const { data: c } = await supabase.from("staff_cases").select("*").eq("case_number", caseNumber).maybeSingle();
  if (!c) notFound();
  await logAudit({ actorId: user.id, channel: "web", action: "view", entity: "cases", entityId: c.id });

  const [{ data: events }, { data: docs }, { data: officers }, cfg] = await Promise.all([
    supabase.from("case_events").select("id,type,visibility,created_at,body").eq("case_id", c.id).order("created_at"),
    supabase.from("documents").select("id,file_name,visibility,created_at").eq("case_id", c.id).order("created_at"),
    supabase.from("profiles").select("id,full_name,office").in("role", ["staff", "admin"]).eq("active", true).order("full_name"),
    loadWorkflowConfig(),
  ]);
  // Staff-only extras (page already passed requireStaff): AI output and database flags.
  const [triageRow, summaryRow, flags] = await Promise.all([latestAi(c.id, "triage"), latestAi(c.id, "case_summary"), caseFlags(c.id)]);
  const aiOn = cfg.aiEnabled && getAiProvider() !== null;
  // Advocate notification state (server-side; this page already passed requireStaff).
  const admin = createAdminClient();
  const [{ data: advCase }, { data: advDeadline }, { data: advResponses }, { data: shareDocs }] = await Promise.all([
    admin.from("cases").select("advocate_served_on,advocate_service_method,advocate_notified_at,advocates(full_name,admission_no,firm)").eq("id", c.id).single(),
    admin.from("case_deadlines").select("due_at").eq("case_id", c.id).eq("kind", "advocate_response").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("advocate_responses").select("id,text,late,created_at").eq("case_id", c.id).order("created_at"),
    admin.from("documents").select("id,file_name,shared_with_advocate").eq("case_id", c.id).eq("visibility", "parties").order("created_at"),
  ]);
  const roll = advCase?.advocates as unknown as { full_name: string; admission_no: string; firm: string | null } | null;
  const [hearings, members, decision] = await Promise.all([caseHearings(c.id), panelMembers(), currentDecision(c.id)]);
  const { data: referral } = decision
    ? await admin.from("referrals").select("id,status,tribunal_reference").eq("decision_id", decision.id).maybeSingle()
    : { data: null };
  const scheduled = hearings.find((h) => h.status === "scheduled") ?? null;

  const t = await getTranslations("staffCase");
  const tOutcome = await getTranslations("commission.outcomes");
  const tStages = await getTranslations("stages");
  const tCat = await getTranslations("categories");
  const format = await getFormatter();
  const stageName = (s: string) => labelFor(s, locale, cfg, (k) => tStages(k));
  const categoryName = (k: string) => (tCat.has(k) ? tCat(k) : k);
  const stage = isStage(c.stage) ? c.stage : "received";
  const due = c.open_deadline_due ? new Date(c.open_deadline_due) : null;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Link href="/staff" className="text-sm underline">
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{c.case_number}</h1>
          <StageBadge stage={c.stage} label={stageName(c.stage)} />
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">{t("category")}</dt>
          <dd data-testid="case-category">{c.category ? categoryName(c.category) : "—"}</dd>
          <dt className="text-slate-500">{t("priority")}</dt>
          <dd>{t(`priorities.${c.priority}`)}</dd>
          <dt className="text-slate-500">{t("officer")}</dt>
          <dd>{c.assigned_officer_name ?? t("unassigned")}</dd>
          <dt className="text-slate-500">{t("nextDeadline")}</dt>
          <dd className={due && due.getTime() < Date.now() ? "font-semibold text-red-700" : ""}>
            {due ? format.dateTime(due, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "—"}
          </dd>
          <dt className="text-slate-500">{t("channel")}</dt>
          <dd>
            {t(`channels.${c.channel}`)}
            {c.office ? ` · ${c.office}` : ""}
          </dd>
        </dl>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("complaint")}</h2>
          <p className="text-sm text-slate-500">{t("against", { name: c.advocate_name_given })}</p>
          <p className="font-medium">{c.summary}</p>
          <p className="whitespace-pre-wrap text-slate-700">{c.description}</p>
        </section>

        <section className="flex flex-col gap-1 text-sm">
          <h2 className="text-lg font-semibold">{t("complainant")}</h2>
          <p>{c.complainant_name ?? "—"}</p>
          <p>{c.complainant_phone ?? t("noPhone")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("documents")}</h2>
          {!docs?.length ? (
            <p className="text-sm text-slate-500">{t("noDocuments")}</p>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {docs.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documents/${d.id}`} className="underline">
                    {d.file_name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("timeline")}</h2>
          <Timeline events={(events ?? []) as TimelineEvent[]} showInternal stageName={stageName} />
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <AiPanel
          caseId={c.id}
          path={`/${locale}/staff/cases/${caseSlug(c.case_number)}`}
          aiOn={aiOn}
          canWrite={user.role !== "commissioner"}
          triage={
            triageRow
              ? ({
                  ...(triageRow.output ?? {}),
                  id: triageRow.id,
                  status: triageRow.status,
                  model: triageRow.model,
                  created_at: triageRow.created_at,
                  categoryLabel: typeof triageRow.output?.category === "string" ? categoryName(triageRow.output.category) : undefined,
                } as AiTriageView)
              : null
          }
          summary={summaryRow ? ({ ...(summaryRow.output ?? {}), status: summaryRow.status, created_at: summaryRow.created_at } as AiSummaryView) : null}
        />
        <FlagsPanel flags={flags} />
        <HearingPanel
          caseId={c.id}
          path={`/${locale}/staff/cases/${caseSlug(c.case_number)}`}
          canWrite={user.role !== "commissioner"}
          canSchedule={["investigation", "conciliation", "hearing"].includes(c.stage)}
          scheduled={
            scheduled
              ? {
                  id: scheduled.id,
                  whenLocal: nairobiWhen(scheduled.starts_at).replace(" ", "T"),
                  whenLabel: format.dateTime(new Date(scheduled.starts_at), { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi" }),
                  duration: scheduled.duration_minutes,
                  mode: scheduled.mode,
                  venue: scheduled.venue,
                  link: scheduled.online_link,
                  panel: scheduled.panel,
                }
              : null
          }
          history={hearings
            .filter((h) => h.id !== scheduled?.id)
            .map((h) => ({ id: h.id, status: h.status, whenLabel: format.dateTime(new Date(h.starts_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) }))}
          members={members}
          bundleHref={`/api/cases/${c.id}/bundle`}
          decision={decision ? { outcomeLabel: tOutcome(decision.outcome), letterHref: `/api/decisions/${decision.id}/letter` } : null}
          referral={
            referral
              ? { id: referral.id, status: referral.status, reference: referral.tribunal_reference, packHref: `/api/referrals/${referral.id}/pack` }
              : null
          }
        />
        <AdvocatePanel
          caseId={c.id}
          path={`/${locale}/staff/cases/${caseSlug(c.case_number)}`}
          canWrite={user.role !== "commissioner"}
          stage={c.stage}
          linked={roll ? { name: roll.full_name, admissionNo: roll.admission_no, firm: roll.firm } : null}
          served={
            advCase?.advocate_notified_at && advCase.advocate_served_on
              ? { on: advCase.advocate_served_on, method: advCase.advocate_service_method ?? "hand", due: advDeadline?.due_at ?? null }
              : null
          }
          documents={(shareDocs ?? []).map((d) => ({ id: d.id, fileName: d.file_name, shared: d.shared_with_advocate }))}
          responses={(advResponses ?? []).map((r) => ({ id: r.id, text: r.text, late: r.late, createdAt: r.created_at }))}
        />
        <CaseActions
          caseId={c.id}
          path={`/${locale}/staff/cases/${caseSlug(c.case_number)}`}
          stage={stage}
          nextStages={allowedNextStages(stage, cfg).map((s) => ({ value: s, label: stageName(s) }))}
          officers={(officers ?? []).map((o) => ({
            value: o.id,
            label: `${o.full_name ?? o.id.slice(0, 8)}${o.office ? ` (${o.office})` : ""}`,
          }))}
          assignedOfficerId={c.assigned_officer_id}
          categories={cfg.categories.map((k) => ({ value: k, label: categoryName(k) }))}
          category={c.category}
          priority={c.priority}
          canWrite={user.role !== "commissioner"}
        />
      </aside>
    </main>
  );
}
