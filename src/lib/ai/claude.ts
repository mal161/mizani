import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { AiProvider, AiResult, SummaryInput, TriageInput } from "./provider";
import { triageSchema, caseSummarySchema, type Triage, type CaseSummary } from "./schemas";
import { TRIAGE_SYSTEM, SUMMARY_SYSTEM, triageUserMessage, summaryUserMessage } from "./prompts";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** The subset of the Anthropic client this provider uses (lets tests inject a stub). */
export type ParseClient = { beta: { messages: Pick<Anthropic["beta"]["messages"], "parse"> } };

/**
 * Claude via the Anthropic API, with structured outputs (validated JSON) and the server-side
 * refusal fallback: if the model declines, the API retries on a fallback model in the same call.
 */
export class ClaudeProvider implements AiProvider {
  readonly name = "claude";
  readonly model: string;
  private client: ParseClient;

  constructor(opts: { client?: ParseClient; model?: string } = {}) {
    this.model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
    this.client = opts.client ?? new Anthropic({ timeout: 30_000, maxRetries: 2 });
  }

  private async call<T>(
    schema: z.ZodType<T>,
    system: string,
    user: string,
    effort: "low" | "medium",
    maxTokens: number,
  ): Promise<AiResult<T>> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort, format: betaZodOutputFormat(schema) },
      });
      if (res.stop_reason === "refusal") return { ok: false, reason: "refused" };
      if (res.parsed_output == null) return { ok: false, reason: "invalid_output" };
      return { ok: true, value: res.parsed_output as T };
    } catch (e) {
      // Never log request content: it is redacted, but still case material.
      const status = e instanceof Anthropic.APIError ? e.status : undefined;
      console.error(`ClaudeProvider call failed${status ? ` (HTTP ${status})` : ""}`);
      return { ok: false, reason: "error" };
    }
  }

  triage(input: TriageInput): Promise<AiResult<Triage>> {
    return this.call(triageSchema, TRIAGE_SYSTEM, triageUserMessage(input.text, input.categories), "low", 2000);
  }

  summarizeCase(input: SummaryInput): Promise<AiResult<CaseSummary>> {
    return this.call(caseSummarySchema, SUMMARY_SYSTEM, summaryUserMessage(input.complaint, input.timeline), "medium", 4000);
  }
}
