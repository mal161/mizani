import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { caseNumberFromSlug, caseSlug } from "@/lib/cases/case-number";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";
import { labelFor } from "@/lib/cases/workflow-config";
import { logAudit } from "@/lib/audit";
import { COMMISSION_ROLES } from "@/lib/commission/roles";
import { caseHearings } from "@/lib/commission/hearings";
import { currentDecision } from "@/lib/commission/decisions";
import { panelMembers } from "@/lib/commission/portal";
import { StageBadge } from "@/components/case/StageBadge";
import { CaseStamp } from "@/components/case/CaseStamp";
import { Timeline, type TimelineEvent } from "@/components/case/Timeline";
import { Link, type Locale } from "@/i18n/routing";
import { MinutesForm } from "./MinutesForm";
import { DecisionForm } from "./DecisionForm";

const section = "flex flex-col gap-2";
const h2 = "text-lg font-medium";

export default async function CommissionCasePage({ params }: { params: Promise<{ locale: Locale; caseNumber: string }> }) {
  const { locale, caseNumber: slug } = await params;
  const user = await requireStaff(locale, COMMISSION_ROLES);
  const caseNumber = caseNumberFromSlug(slug);
  if (!caseNumber) notFound();

  const supabase = await createServerClient();
  const { data: c } = await supabase.from("staff_cases").select("*").eq("case_number", caseNumber).maybeSingle();
  if (!c) notFound();
  await logAudit({ actorId: user.id, channel: "web", action: "view", entity: "cases", entityId: c.id });

  const admin = createAdminClient();
  const [{ data: events }, { data: docs }, { data: responses }, { data: adv }, hearings, decision, members, cfg] = await Promise.all([
    supabase.from("case_events").select("id,type,visibility,created_at,body").eq("case_id", c.id).order("created_at"),
    supabase.from("documents").select("id,file_name,created_at").eq("case_id", c.id).order("created_at"),
    admin.from("advocate_responses").select("id,text,late,created_at").eq("case_id", c.id).order("created_at"),
    admin.from("cases").select("advocates(full_name,admission_no,firm)").eq("id", c.id).single(),
    caseHearings(c.id),
    currentDecision(c.id),
    panelMembers(),
    loadWorkflowConfig(),
  ]);
  const { data: referral } = decision
    ? await admin.from("referrals").select("id,status,tribunal_reference").eq("decision_id", decision.id).maybeSingle()
    : { data: null };
  const roll = adv?.advocates as unknown as { full_name: string; admission_no: string; firm: string | null } | null;
  const names = new Map(members.map((m) => [m.id, m.name]));

  const t = await getTranslations("commission");
  const tCase = await getTranslations("staffCase");
  const tStages = await getTranslations("stages");
  const format = await getFormatter();
  const stageName = (s: string) => labelFor(s, locale, cfg, (k) => tStages(k));
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
  const path = `/${locale}/commission/cases/${caseSlug(c.case_number)}`;

  const live = hearings.find((h) => h.status === "scheduled" || h.status === "held");
  const onPanel = (panel: string[]) => user.role === "admin" || panel.includes(user.id);
  // A first decision needs a held hearing; only commissioners who sat on it (or on the decision being corrected) decide.
  const held = hearings.find((h) => h.status === "held");
  const sat = [...(held?.panel ?? []), ...(decision?.panel ?? [])];
  const canDecide =
    ((c.stage === "hearing" && Boolean(held)) || c.stage === "decision") && (user.role === "admin" || sat.includes(user.id));
  const defaultPanel = live?.panel ?? decision?.panel ?? [user.id];

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Link href="/commission" className="text-sm underline">
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1>
          <CaseStamp number={c.case_number} size="lg" />
        </h1>
          <StageBadge stage={c.stage} label={stageName(c.stage)} />
          <a href={`/api/cases/${c.id}/bundle`} className="ml-auto rounded-md border px-3 py-1.5 text-sm underline">
            {t("downloadBundle")}
          </a>
        </div>

        <section className={section}>
          <h2 className={h2}>{tCase("complaint")}</h2>
          <p className="font-medium">{c.summary}</p>
          <p className="whitespace-pre-wrap text-slate-700">{c.description}</p>
        </section>

        <section className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <h2 className={h2}>{tCase("complainant")}</h2>
            <p>{c.complainant_name ?? "—"}</p>
            <p>{c.complainant_phone ?? tCase("noPhone")}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className={h2}>{t("advocate")}</h2>
            <p>{roll ? `${roll.full_name} (${roll.admission_no})` : c.advocate_name_given}</p>
            {roll?.firm && <p>{roll.firm}</p>}
          </div>
        </section>

        <section className={section}>
          <h2 className={h2}>{t("responses")}</h2>
          {!responses?.length ? (
            <p className="text-sm text-slate-500">{t("noResponses")}</p>
          ) : (
            responses.map((r) => (
              <article key={r.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="mb-1 text-xs text-slate-500">
                  {when(r.created_at)}
                  {r.late ? ` · ${t("late")}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{r.text}</p>
              </article>
            ))
          )}
        </section>

        <section className={section}>
          <h2 className={h2}>{tCase("documents")}</h2>
          {!docs?.length ? (
            <p className="text-sm text-slate-500">{tCase("noDocuments")}</p>
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

        <section className={section}>
          <h2 className={h2}>{tCase("timeline")}</h2>
          <Timeline events={(events ?? []) as TimelineEvent[]} showInternal stageName={stageName} />
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {decision && (
          <section className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm" data-testid="decision">
            <h2 className={h2}>{t("decision.issued")}</h2>
            <p className="text-base font-medium" data-testid="decision-outcome">
              {t(`outcomes.${decision.outcome}`)}
            </p>
            {decision.amount_kes != null && <p className="font-medium">KES {format.number(Number(decision.amount_kes))}</p>}
            <p className="text-xs text-slate-500">
              {when(decision.decided_at)} · {decision.panel.map((p) => names.get(p) ?? "—").join(", ")}
            </p>
            <p className="whitespace-pre-wrap">{decision.reasons}</p>
            {decision.orders && (
              <>
                <h3 className="font-medium">{t("decision.orders")}</h3>
                <p className="whitespace-pre-wrap">{decision.orders}</p>
              </>
            )}
            <a href={`/api/decisions/${decision.id}/letter`} className="underline">
              {t("downloadLetter")}
            </a>
            {referral && (
              <>
                <p className="text-xs text-slate-600">
                  {t("referral.status")}: {t(`referral.statuses.${referral.status}`)}
                  {referral.tribunal_reference ? ` · ${referral.tribunal_reference}` : ""}
                </p>
                <a href={`/api/referrals/${referral.id}/pack`} className="underline">
                  {t("downloadPack")}
                </a>
              </>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className={h2}>{t("hearings")}</h2>
          {hearings.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noHearings")}</p>
          ) : (
            hearings.map((h) => (
              <article key={h.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {when(h.starts_at)} · {t(`hearing.status.${h.status}`)}
                </p>
                <p>{h.mode === "online" ? `${t("hearing.online")}${h.online_link ? ` · ${h.online_link}` : ""}` : h.venue}</p>
                <p className="text-xs text-slate-500">
                  {t("decision.panel")}: {h.panel.map((p) => names.get(p) ?? "—").join(", ")}
                </p>
                {h.minutes && (
                  <div className="mt-1 rounded bg-amber-50 p-2">
                    <p className="text-xs font-medium text-amber-900">{t("minutes.internal")}</p>
                    <p className="whitespace-pre-wrap">{h.minutes}</p>
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        {live && onPanel(live.panel) && <MinutesForm hearingId={live.id} path={path} current={live.minutes} />}

        {canDecide && (
          <DecisionForm caseId={c.id} path={path} members={members} defaultPanel={defaultPanel} correcting={Boolean(decision)} />
        )}
      </aside>
    </main>
  );
}
