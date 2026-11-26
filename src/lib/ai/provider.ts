import type { Triage, CaseSummary } from "./schemas";

/** Inputs are already redacted (see redact.ts) before they reach any provider. */
export interface TriageInput {
  text: string;
  categories: string[];
}

export interface SummaryInput {
  complaint: string;
  timeline: string;
}

export type AiFailure = "refused" | "invalid_output" | "error";
export type AiResult<T> = { ok: true; value: T } | { ok: false; reason: AiFailure };

/**
 * The one seam between Mizani and any AI model. Swap the implementation (Claude, a self-hosted model,
 * another provider under a data-transfer agreement) without touching the rest of the system.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  triage(input: TriageInput): Promise<AiResult<Triage>>;
  summarizeCase(input: SummaryInput): Promise<AiResult<CaseSummary>>;
}
