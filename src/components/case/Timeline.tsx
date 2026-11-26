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
  const format = useFormatter();
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
                : null;
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
