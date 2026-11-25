export const STAGES = [
  "received",
  "screening",
  "advocate_notified",
  "investigation",
  "conciliation",
  "hearing",
  "decision",
  "closed",
] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v);
}

/** Translated stage label. `t` is a next-intl translator scoped to the "stages" namespace. */
export function stageLabel(stage: string, t: (key: Stage) => string): string {
  return isStage(stage) ? t(stage) : stage;
}
