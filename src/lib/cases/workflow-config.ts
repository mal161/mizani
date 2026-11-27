import { STAGES, isStage, type Stage } from "./stages";
import type { Locale } from "@/i18n/routing";

/** Allowed stage moves. Admins can disable conciliation and rename stages, not add stages. */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  received: ["screening"],
  screening: ["advocate_notified", "closed"],
  advocate_notified: ["investigation"],
  investigation: ["conciliation", "hearing", "closed"],
  conciliation: ["hearing", "closed"],
  hearing: ["decision"],
  decision: ["closed"],
  closed: [],
};

export type StageLabels = Record<Locale, Partial<Record<Stage, string>>>;

export interface WorkflowConfig {
  slaDays: Record<Exclude<Stage, "closed">, number>;
  conciliationEnabled: boolean;
  stageLabels: StageLabels;
  categories: string[];
  advocateResponseDays: number;
  aiEnabled: boolean;
  /** Read scanned documents with OCR (soma-OCR). */
  ocrEnabled: boolean;
}

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  slaDays: {
    received: 3,
    screening: 7,
    advocate_notified: 14,
    investigation: 30,
    conciliation: 21,
    hearing: 14,
    decision: 14,
  },
  conciliationEnabled: true,
  stageLabels: { en: {}, sw: {} },
  categories: ["withheld_funds", "negligence", "delay", "misconduct", "overcharging", "conflict_of_interest", "other"],
  advocateResponseDays: 14,
  aiEnabled: true,
  ocrEnabled: true,
};

export function allowedNextStages(from: Stage, cfg: WorkflowConfig): Stage[] {
  return TRANSITIONS[from].filter((s) => s !== "conciliation" || cfg.conciliationEnabled);
}

/** Days allowed in a stage; the advocate's response window governs advocate_notified; closed has none. */
export function slaDaysFor(stage: Stage, cfg: WorkflowConfig): number | null {
  if (stage === "closed") return null;
  if (stage === "advocate_notified") return cfg.advocateResponseDays;
  return cfg.slaDays[stage];
}

export function labelFor(
  stage: string,
  locale: Locale,
  cfg: Pick<WorkflowConfig, "stageLabels">,
  t: (key: Stage) => string,
): string {
  if (!isStage(stage)) return stage;
  return cfg.stageLabels[locale]?.[stage] || t(stage);
}

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Builds a config from `settings` rows; missing or malformed values fall back to defaults. */
export function parseWorkflowConfig(rows: { key: string; value: unknown }[]): WorkflowConfig {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const cfg: WorkflowConfig = structuredClone(DEFAULT_WORKFLOW);

  const sla = get("sla_days");
  if (sla && typeof sla === "object") {
    for (const s of STAGES) {
      if (s === "closed") continue;
      const v = (sla as Record<string, unknown>)[s];
      if (isPosInt(v)) cfg.slaDays[s] = v;
    }
  }
  const conc = get("conciliation_enabled");
  if (typeof conc === "boolean") cfg.conciliationEnabled = conc;

  const labels = get("stage_labels");
  if (labels && typeof labels === "object") {
    for (const l of ["en", "sw"] as const) {
      const m = (labels as Record<string, unknown>)[l];
      if (m && typeof m === "object") {
        for (const [k, v] of Object.entries(m)) {
          if (isStage(k) && typeof v === "string" && v.trim()) cfg.stageLabels[l][k] = v.trim();
        }
      }
    }
  }
  const cats = get("categories");
  if (Array.isArray(cats) && cats.length > 0 && cats.every((c) => typeof c === "string")) cfg.categories = cats;

  const ai = get("ai_enabled");
  if (typeof ai === "boolean") cfg.aiEnabled = ai;

  const ocr = get("ocr_enabled");
  if (typeof ocr === "boolean") cfg.ocrEnabled = ocr;

  const days = get("advocate_response_days");
  if (isPosInt(days)) cfg.advocateResponseDays = days;
  return cfg;
}
