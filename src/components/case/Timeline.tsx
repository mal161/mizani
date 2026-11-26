import { useFormatter, useTranslations } from "next-intl";

export interface TimelineEvent {
  id: string;
  type: string;
  visibility?: string;
  created_at: string;
  body: Record<string, unknown>;
}

const KNOWN = [
  "filed",
  "stage_changed",
  "info_requested",
  "info_provided",
  "advocate_responded",
  "hearing_scheduled",
  "decision_issued",
  "note",
  "assigned",
  "triaged",
  "sms_failed",
  "routing_failed",
  "ai_failed",
  "advocate_notified",
  "advocate_linked",
  "hearing_changed",
  "hearing_held",
  "referral_updated",
];

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Case history. Complainants receive only non-internal events (RLS); staff pass showInternal to see
 * notes and internal markers. `stageName` resolves stage keys to (possibly admin-renamed) labels.
 */
export function Timeline({
  events,
  showInternal = false,
  stageName = (s: string) => s,
}: {
  events: TimelineEvent[];
  showInternal?: boolean;
  stageName?: (stage: string) => string;
}) {
  const t = useTranslations("timeline");
  const tc = useTranslations("commission");
  const format = useFormatter();
  const when = (v: unknown) =>
    typeof v === "string" ? format.dateTime(new Date(v), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "";
  const place = (b: Record<string, unknown>) => (b.mode === "online" ? tc("hearing.online") : (str(b.venue) ?? ""));
  const outcome = (v: unknown) => (typeof v === "string" && tc.has(`outcomes.${v}`) ? tc(`outcomes.${v}`) : "");
  const commissionDetail = (type: string, b: Record<string, unknown>): string | null => {
    if (type === "hearing_scheduled") return `${when(b.starts_at)} · ${place(b)}`;
    if (type === "hearing_changed") {
      if (b.change === "rescheduled") return `${t("hearingRescheduled")}: ${when(b.starts_at)} · ${place(b)}`;
      const status = typeof b.change === "string" && tc.has(`hearing.status.${b.change}`) ? tc(`hearing.status.${b.change}`) : "";
      return [status, str(b.reason)].filter(Boolean).join(" · ");
    }
    if (type === "decision_issued") return `${outcome(b.outcome)}${b.corrected ? ` (${t("corrected")})` : ""}`;
    if (type === "referral_updated") {
      const status = typeof b.status === "string" && tc.has(`referral.statuses.${b.status}`) ? tc(`referral.statuses.${b.status}`) : "";
      return [status, str(b.tribunal_reference)].filter(Boolean).join(" · ");
    }
    return null;
  };
  if (events.length === 0) return <p className="text-sm text-slate-500">{t("empty")}</p>;
  return (
    <ol aria-label={t("label")} className="flex flex-col gap-3 border-l pl-4">
      {events.map((e) => {
        const b = e.body ?? {};
        const detail =
          e.type === "stage_changed"
            ? `${stageName(String(b.from))} → ${stageName(String(b.to))}${str(b.reason) ? ` · ${str(b.reason)}` : ""}`
            : e.type === "note"
              ? str(b.text)
              : e.type === "info_requested" || e.type === "info_provided"
                ? str(b.message) ?? str(b.text)
                : commissionDetail(e.type, b);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
            <p className="font-medium">
              {KNOWN.includes(e.type) ? t(`types.${e.type}`) : t("types.other")}
              {showInternal && e.visibility === "internal" && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t("internal")}</span>
              )}
            </p>
            {detail && <p className="whitespace-pre-wrap text-sm text-slate-700">{detail}</p>}
            <time dateTime={e.created_at} className="text-xs text-slate-500">
              {format.dateTime(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
