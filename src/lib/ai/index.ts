import type { AiProvider } from "./provider";
import { ClaudeProvider } from "./claude";
import { FakeAiProvider } from "./fake";
import { OpenAICompatibleProvider } from "./openai-compatible";

export type { AiProvider, AiResult } from "./provider";

let cached: { key: string; provider: AiProvider | null } | null = null;
const warned = new Set<string>();

function warnOnce(msg: string) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/**
 * The configured provider, from AI_PROVIDER (default "none"):
 * - "claude": Anthropic API (ANTHROPIC_API_KEY; AI_MODEL optional)
 * - "openrouter": OpenRouter (AI_API_KEY, AI_MODEL required; OPENROUTER_PROVIDERS optional comma list)
 * - "openai-compatible": any OpenAI-style server, e.g. a self-hosted model (AI_BASE_URL, AI_MODEL; AI_API_KEY if needed)
 * - "fake": deterministic stand-in; "none": AI off.
 * Missing settings mean AI is off (null), with one warning.
 */
export function getAiProvider(): AiProvider | null {
  const env = process.env;
  const kind = (env.AI_PROVIDER ?? "none").toLowerCase();
  const key = [kind, env.ANTHROPIC_API_KEY ? "k" : "", env.AI_API_KEY ? "k" : "", env.AI_MODEL, env.AI_BASE_URL, env.OPENROUTER_PROVIDERS].join("|");
  if (cached?.key === key) return cached.provider;

  let provider: AiProvider | null = null;
  if (kind === "fake") provider = new FakeAiProvider();
  else if (kind === "claude") {
    if (env.ANTHROPIC_API_KEY) provider = new ClaudeProvider();
    else warnOnce("AI_PROVIDER=claude but ANTHROPIC_API_KEY is not set: AI features are off.");
  } else if (kind === "openrouter") {
    if (env.AI_API_KEY && env.AI_MODEL) {
      provider = new OpenAICompatibleProvider({
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
        openRouter: true,
        onlyProviders: env.OPENROUTER_PROVIDERS?.split(",").map((s) => s.trim()).filter(Boolean),
      });
    } else warnOnce("AI_PROVIDER=openrouter needs AI_API_KEY and AI_MODEL: AI features are off.");
  } else if (kind === "openai-compatible") {
    if (env.AI_BASE_URL && env.AI_MODEL) {
      provider = new OpenAICompatibleProvider({
        name: "openai-compatible",
        baseUrl: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY ?? "",
        model: env.AI_MODEL,
      });
    } else warnOnce("AI_PROVIDER=openai-compatible needs AI_BASE_URL and AI_MODEL: AI features are off.");
  }
  cached = { key, provider };
  return provider;
}

export function resetAiProviderForTests() {
  cached = null;
}
