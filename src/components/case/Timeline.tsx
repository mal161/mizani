import { useFormatter, useTranslations } from "next-intl";

export interface TimelineEvent {
  id: string;
  type: string;
  created_at: string;
  body: Record<string, unknown>;
}

const KNOWN = ["filed", "stage_changed", "info_requested", "info_provided", "advocate_responded", "hearing_scheduled", "decision_issued"];

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("timeline");
  const format = useFormatter();
  if (events.length === 0) return <p className="text-sm text-slate-500">{t("empty")}</p>;
  return (
    <ol aria-label={t("label")} className="flex flex-col gap-3 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
          <p className="font-medium">{KNOWN.includes(e.type) ? t(`types.${e.type}`) : t("types.other")}</p>
          <time dateTime={e.created_at} className="text-xs text-slate-500">
            {format.dateTime(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}
          </time>
        </li>
      ))}
    </ol>
  );
}
