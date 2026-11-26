import { describe, it, expect, afterEach } from "vitest";
import { ClaudeProvider, type ParseClient } from "@/lib/ai/claude";
import { FakeAiProvider } from "@/lib/ai/fake";
import { getAiProvider, resetAiProviderForTests } from "@/lib/ai";
import { TRIAGE_SYSTEM } from "@/lib/ai/prompts";
import { parseWorkflowConfig } from "@/lib/cases/workflow-config";

const categories = ["withheld_funds", "negligence", "delay", "other"];
const goodTriage = {
  category: "withheld_funds",
  priority: "high",
  urgency_reasons: ["Money withheld for months"],
  summary_en: "The [ADVOCATE] withheld settlement money.",
  summary_sw: "[ADVOCATE] amezuia pesa za fidia.",
  language: "en",
};

function stub(response: unknown | (() => never)) {
  const calls: Record<string, unknown>[] = [];
  const client: ParseClient = {
    beta: {
      messages: {
        parse: (async (params: Record<string, unknown>) => {
          calls.push(params);
          if (typeof response === "function") (response as () => never)();
          return response;
        }) as never,
      },
    },
  };
  return { client, calls };
}

afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  resetAiProviderForTests();
});

describe("ClaudeProvider", () => {
  it("returns the parsed triage and sends the right request", async () => {
    const { client, calls } = stub({ stop_reason: "end_turn", parsed_output: goodTriage });
    const p = new ClaudeProvider({ client });
    const r = await p.triage({ text: "redacted text", categories });
    expect(r).toEqual({ ok: true, value: goodTriage });
    const req = calls[0] as Record<string, any>;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config.effort).toBe("low");
    expect(req.max_tokens).toBe(2000);
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(JSON.stringify(req.messages)).toContain("withheld_funds");
  });

  it("maps a refusal", async () => {
    const { client } = stub({ stop_reason: "refusal", parsed_output: null });
    expect(await new ClaudeProvider({ client }).triage({ text: "x", categories })).toEqual({ ok: false, reason: "refused" });
  });

  it("maps unparseable output", async () => {
    const { client } = stub({ stop_reason: "end_turn", parsed_output: null });
    expect(await new ClaudeProvider({ client }).triage({ text: "x", categories })).toEqual({ ok: false, reason: "invalid_output" });
  });

  it("maps a thrown SDK error", async () => {
    const { client } = stub(() => {
      throw new Error("boom");
    });
    expect(await new ClaudeProvider({ client }).triage({ text: "x", categories })).toEqual({ ok: false, reason: "error" });
  });

  it("summarises with medium effort", async () => {
    const out = { summary_en: "s", summary_sw: "s", key_dates: [], open_questions: [] };
    const { client, calls } = stub({ stop_reason: "end_turn", parsed_output: out });
    const r = await new ClaudeProvider({ client }).summarizeCase({ complaint: "c", timeline: "t" });
    expect(r).toEqual({ ok: true, value: out });
    expect((calls[0] as Record<string, any>).output_config.effort).toBe("medium");
  });

  it("keeps the system prompt cache-stable (no dates or ids)", () => {
    expect(TRIAGE_SYSTEM).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("FakeAiProvider", () => {
  it("is deterministic and records calls", async () => {
    const f = new FakeAiProvider();
    const r = await f.triage({ text: "The advocate withheld funds: KES 40,000", categories });
    expect(r.ok && r.value.category).toBe("withheld_funds");
    expect(r.ok && r.value.priority).toBe("high");
    expect(f.calls).toHaveLength(1);
  });

  it("failNext makes exactly the next call fail", async () => {
    const f = new FakeAiProvider();
    f.failNext("refused");
    expect(await f.triage({ text: "x", categories })).toEqual({ ok: false, reason: "refused" });
    expect((await f.triage({ text: "x", categories })).ok).toBe(true);
  });
});

describe("getAiProvider", () => {
  it("honours AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "none";
    expect(getAiProvider()).toBeNull();
    resetAiProviderForTests();
    process.env.AI_PROVIDER = "fake";
    expect(getAiProvider()).toBeInstanceOf(FakeAiProvider);
    resetAiProviderForTests();
    process.env.AI_PROVIDER = "claude";
    expect(getAiProvider()).toBeNull(); // no API key
    resetAiProviderForTests();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(getAiProvider()).toBeInstanceOf(ClaudeProvider);
  });

  it("defaults to none", () => {
    expect(getAiProvider()).toBeNull();
  });
});

describe("workflow config", () => {
  it("reads ai_enabled with default true", () => {
    expect(parseWorkflowConfig([]).aiEnabled).toBe(true);
    expect(parseWorkflowConfig([{ key: "ai_enabled", value: false }]).aiEnabled).toBe(false);
  });
});
