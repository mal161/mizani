import type { AiProvider } from "./provider";
import { ClaudeProvider } from "./claude";
import { FakeAiProvider } from "./fake";

export type { AiProvider, AiResult } from "./provider";

let cached: { key: string; provider: AiProvider | null } | null = null;
let warned = false;

/**
 * The configured provider, from AI_PROVIDER: "claude" | "fake" | "none" (default "none").
 * "claude" without ANTHROPIC_API_KEY is treated as none. Returns null when AI is unavailable.
 */
export function getAiProvider(): AiProvider | null {
  const kind = (process.env.AI_PROVIDER ?? "none").toLowerCase();
  const key = `${kind}:${process.env.ANTHROPIC_API_KEY ? "k" : ""}:${process.env.AI_MODEL ?? ""}`;
  if (cached?.key === key) return cached.provider;

  let provider: AiProvider | null = null;
  if (kind === "fake") provider = new FakeAiProvider();
  else if (kind === "claude") {
    if (process.env.ANTHROPIC_API_KEY) provider = new ClaudeProvider();
    else if (!warned) {
      warned = true;
      console.warn("AI_PROVIDER=claude but ANTHROPIC_API_KEY is not set: AI features are off.");
    }
  }
  cached = { key, provider };
  return provider;
}

export function resetAiProviderForTests() {
  cached = null;
}
