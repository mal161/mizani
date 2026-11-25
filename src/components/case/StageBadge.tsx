import { useTranslations } from "next-intl";
import { stageLabel } from "@/lib/cases/stages";

export function StageBadge({ stage }: { stage: string }) {
  const t = useTranslations("stages");
  return (
    <span
      data-testid="stage"
      className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800"
    >
      {stageLabel(stage, t)}
    </span>
  );
}
