import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/brand/Logo";
import { CaseFileCard } from "./CaseFileCard";

/*
 * Illustrations for the home "From complaint to decision" story, drawn in code so every word is translated and stays
 * sharp. Each is a real object from the case: the docket, a notice, the evidence, a hearing notice, a decision letter.
 * Example data only (case ACC/2026/000231); no real people.
 */

const paper = "rounded-md border border-slate-200 bg-white shadow-[0_12px_32px_rgb(15_23_42/0.12)]";
/** Grey bars standing in for paragraph text. */
function Lines({ widths }: { widths: string[] }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {widths.map((w, i) => (
        <span key={i} className="h-2 rounded-full bg-slate-200" style={{ width: w }} />
      ))}
    </div>
  );
}

/** Step 1: the case-file docket, with the SMS that gives the case number and PIN. */
export async function ReceivedArt() {
  const t = await getTranslations("home.story");
  return (
    <div role="img" aria-label={t("illustration.received")} className="relative mx-auto w-full max-w-md">
      <div aria-hidden>
        <CaseFileCard />
      </div>
      {/* In flow with a fixed overlap, so a longer translation grows downward instead of covering the card. */}
      <div aria-hidden className="relative -mt-6 -ml-2 w-64 -rotate-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgb(15_23_42/0.16)] sm:-ml-8">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-primary">{t("sms.from")}</span>
          <span>{t("sms.time")}</span>
        </div>
        <p className="rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm leading-5 text-slate-800">{t("sms.text")}</p>
      </div>
    </div>
  );
}

/** Step 2: the formal notice served on the advocate. */
export async function NoticeArt() {
  const t = await getTranslations("home.story");
  const ts = await getTranslations("shell");
  // [label, value, style]: codes in mono, the deadline in flag red, dates in plain text.
  const rows: [string, string, "mono" | "due" | "plain"][] = [
    [t("notice.case"), "ACC/2026/000231", "mono"],
    [t("notice.served"), t("notice.servedValue"), "plain"],
    [t("notice.due"), t("notice.dueValue"), "due"],
    [t("notice.code"), "K7QM-••••", "mono"],
  ];
  const valueClass = { mono: "font-mono font-medium text-slate-800", due: "font-bold text-flag-red", plain: "font-medium text-slate-800" };
  return (
    <div role="img" aria-label={t("illustration.notified")} className="relative mx-auto w-full max-w-md">
      <div aria-hidden className={`${paper} -rotate-1 px-7 py-7`}>
        <div className="flex items-center gap-3 border-b pb-3">
          <LogoMark className="h-7 w-auto" />
          <span className="text-sm leading-tight font-medium text-primary">{ts("org")}</span>
        </div>
        <p className="mt-4 text-xl font-bold text-primary">{t("notice.title")}</p>
        <dl className="mt-3 divide-y divide-slate-100 text-sm">
          {rows.map(([k, v, style]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className={`text-right ${valueClass[style]}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <Lines widths={["100%", "92%", "96%", "60%"]} />
        </div>
      </div>
    </div>
  );
}

/** Step 3: the open file with the evidence clipped in, tagged for more information. */
export async function EvidenceArt() {
  const t = await getTranslations("home.story");
  return (
    <div role="img" aria-label={t("illustration.investigation")} className="relative mx-auto w-full max-w-md">
      <div aria-hidden className="relative">
        {/* Folder back with its tab. */}
        <div className="absolute -top-5 left-6 h-6 w-28 rounded-t-md bg-[#e6d8b3]" />
        <div className="rounded-md bg-[#e6d8b3] p-5 pb-8 shadow-[0_12px_32px_rgb(15_23_42/0.14)]">
          <div className="grid grid-cols-[1fr_1.2fr] items-start gap-4">
            {/* Receipt slip. */}
            <div className="mt-6 -rotate-3 rounded-sm bg-white px-4 py-4 shadow-md">
              <p className="text-xs font-bold tracking-wide text-slate-700">{t("evidence.receipt")}</p>
              <p className="mt-2 text-xs text-slate-500">{t("evidence.receiptLine")}</p>
              <p className="mt-1 font-mono text-base font-medium whitespace-nowrap tabular-nums text-slate-900 sm:text-lg">{t("evidence.receiptAmount")}</p>
              <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
                <Lines widths={["80%", "55%"]} />
              </div>
            </div>
            {/* Sale agreement, paper-clipped. */}
            <div className="relative rotate-2 rounded-sm bg-white px-4 py-4 shadow-md">
              <span className="absolute -top-3 right-6 h-8 w-3 rounded-full border-2 border-slate-400" />
              <p className="text-sm font-bold text-primary">{t("evidence.letter")}</p>
              <div className="mt-3">
                <Lines widths={["100%", "94%", "100%", "88%", "96%", "70%"]} />
              </div>
            </div>
          </div>
        </div>
        {/* Tag on a string. */}
        <div className="absolute -right-2 -bottom-4 rotate-6 rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink shadow-md sm:-right-6">
          {t("evidence.tag")}
        </div>
      </div>
    </div>
  );
}

/** Step 4: the hearing notice: date block, time, venue and the panel. */
export async function HearingArt() {
  const t = await getTranslations("home.story");
  return (
    <div role="img" aria-label={t("illustration.hearing")} className="relative mx-auto w-full max-w-md">
      <div aria-hidden className={`${paper} rotate-1 overflow-hidden`}>
        <div className="bg-primary px-6 py-3 text-sm font-medium text-white">{t("hearing.title")}</div>
        <div className="flex items-center gap-6 px-6 py-6">
          <div className="flex w-20 shrink-0 flex-col items-center rounded-md border-2 border-primary py-2">
            <span className="text-xs font-bold text-flag-red uppercase">{t("hearing.month")}</span>
            <span className="text-4xl leading-none font-bold text-primary tabular-nums">9</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-bold text-slate-900">{t("hearing.weekday")}</span>
            <span className="text-base text-slate-700">{t("hearing.time")}</span>
            <span className="text-sm text-slate-600">{t("hearing.venue")}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t px-6 py-4">
          <div className="flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-200">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-500" />
              </span>
            ))}
          </div>
          <span className="text-sm text-slate-600">{t("hearing.panel")}</span>
        </div>
      </div>
    </div>
  );
}

/** Step 5: the decision letter with outcome, amount and the Commission's seal. */
export async function DecisionArt() {
  const t = await getTranslations("home.story");
  const ts = await getTranslations("shell");
  return (
    <div role="img" aria-label={t("illustration.decision")} className="relative mx-auto w-full max-w-md">
      <div aria-hidden className={`${paper} -rotate-1 px-7 py-7`}>
        <div className="flex items-center gap-3 border-b pb-3">
          <LogoMark className="h-7 w-auto" />
          <span className="text-sm leading-tight font-medium text-primary">{ts("org")}</span>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <p className="text-xl font-bold text-primary">{t("decision.title")}</p>
          <p className="font-mono text-sm text-slate-500">ACC/2026/000231</p>
        </div>
        <div className="mt-3 rounded-md bg-primary-soft px-4 py-3">
          <p className="text-xs text-slate-500">{t("decision.outcomeLabel")}</p>
          <p className="text-lg font-bold text-primary">{t("decision.outcome")}</p>
          <p className="font-mono text-xl font-medium tabular-nums text-slate-900">{t("decision.amount")}</p>
        </div>
        <p className="mt-4 text-xs font-medium text-slate-500">{t("decision.reasons")}</p>
        <div className="mt-2 pr-24">
          <Lines widths={["100%", "96%", "90%", "70%"]} />
        </div>
        <p className="mt-5 text-xs text-slate-500">{t("decision.date")}</p>
      </div>
      {/* The Commission's seal in brand orange. */}
      <div aria-hidden className="absolute right-6 bottom-6 flex h-24 w-24 rotate-[-12deg] flex-col items-center justify-center rounded-full border-[3px] border-accent text-accent-ink">
        <span className="absolute inset-1.5 rounded-full border border-accent/60" />
        <LogoMark className="h-6 w-auto" />
        <span className="mt-1 text-[11px] font-bold">{t("decision.seal")}</span>
      </div>
    </div>
  );
}
