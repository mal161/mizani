import { z } from "zod";
import type { AiProvider, AiResult, SummaryInput, TriageInput } from "./provider";
import { triageSchema, caseSummarySchema, type Triage, type CaseSummary } from "./schemas";
import { TRIAGE_SYSTEM, SUMMARY_SYSTEM, triageUserMessage, summaryUserMessage } from "./prompts";

export interface CompatibleOptions {
  /** Shown in audit records: "openrouter" or "openai-compatible". */
  name: string;
  /** e.g. https://openrouter.ai/api/v1, or a self-hosted server such as vLLM/Ollama. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Adds OpenRouter's routing controls (never sent to other servers). */
  openRouter?: boolean;
  /** OpenRouter: only route to these hosts (e.g. ones covered by a data-transfer agreement). */
  onlyProviders?: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
}

/**
 * Any server that speaks the OpenAI-style /chat/completions API: OpenRouter (many models behind one key)
 * or a self-hosted model. Asks for JSON matching our schema and validates it here, so models without
 * strict structured-output support degrade to "unavailable" instead of breaking anything.
 */
export class OpenAICompatibleProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  private opts: CompatibleOptions;

  constructor(opts: CompatibleOptions) {
    this.opts = opts;
    this.name = opts.name;
    this.model = opts.model;
  }

  private async call<T>(
    schemaName: string,
    schema: z.ZodType<T>,
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<AiResult<T>> {
    const body: Record<string, unknown> = {
      model: this.opts.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema: z.toJSONSchema(schema) },
      },
    };
    if (this.opts.openRouter) {
      // Ask OpenRouter to use only hosts that don't store or train on prompts, optionally pinned to named hosts.
      body.provider = {
        data_collection: "deny",
        ...(this.opts.onlyProviders?.length ? { only: this.opts.onlyProviders } : {}),
      };
    }
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
          ...(this.opts.openRouter ? { "X-Title": "Mizani" } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
      if (!res.ok) {
        // Status only: never log the body (may echo the request) or the key.
        console.error(`${this.name} call failed (HTTP ${res.status})`);
        return { ok: false, reason: "error" };
      }
      const data = (await res.json()) as ChatResponse;
      const choice = data.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") return { ok: false, reason: "refused" };
      const content = choice?.message?.content?.trim();
      if (!content) return { ok: false, reason: "invalid_output" };
      const json = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, reason: "invalid_output" };
      }
      const valid = schema.safeParse(parsed);
      return valid.success ? { ok: true, value: valid.data } : { ok: false, reason: "invalid_output" };
    } catch {
      console.error(`${this.name} call failed (network or timeout)`);
      return { ok: false, reason: "error" };
    }
  }

  triage(input: TriageInput): Promise<AiResult<Triage>> {
    return this.call("triage", triageSchema, TRIAGE_SYSTEM, triageUserMessage(input.text, input.categories), 2000);
  }

  summarizeCase(input: SummaryInput): Promise<AiResult<CaseSummary>> {
    return this.call("case_summary", caseSummarySchema, SUMMARY_SYSTEM, summaryUserMessage(input.complaint, input.timeline), 4000);
  }
}
