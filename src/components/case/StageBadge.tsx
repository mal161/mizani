import { useTranslations } from "next-intl";
import { stageLabel } from "@/lib/cases/stages";

/** Stage pill. Pass `label` when an admin has renamed the stage (see labelFor). */
export function StageBadge({ stage, label }: { stage: string; label?: string }) {
  const t = useTranslations("stages");
  return (
    <span
      data-testid="stage"
      className="inline-block rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800"
    >
      {label ?? stageLabel(stage, t)}
    </span>
  );
}
