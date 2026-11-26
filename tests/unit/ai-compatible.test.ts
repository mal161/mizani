import { describe, it, expect, afterEach } from "vitest";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";
import { getAiProvider, resetAiProviderForTests } from "@/lib/ai";

const categories = ["withheld_funds", "negligence", "other"];
const triage = {
  category: "withheld_funds",
  priority: "high",
  urgency_reasons: ["Money withheld"],
  summary_en: "Alleges money withheld.",
  summary_sw: "Anadai pesa zimezuiwa.",
  language: "en",
};

type Call = { url: string; init: RequestInit };
function stubFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const completion = (content: string | null, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content, ...extra }, finish_reason: "stop" }] }), { status: 200 });

const make = (fetchImpl: typeof fetch, opts: Partial<ConstructorParameters<typeof OpenAICompatibleProvider>[0]> = {}) =>
  new OpenAICompatibleProvider({
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-test",
    model: "vendor/some-model",
    openRouter: true,
    fetchImpl,
    ...opts,
  });

afterEach(() => {
  for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "OPENROUTER_PROVIDERS"]) delete process.env[k];
  resetAiProviderForTests();
});

describe("OpenAICompatibleProvider", () => {
  it("posts a chat completion with a JSON schema and returns the validated result", async () => {
    const { fetchImpl, calls } = stubFetch(() => completion(JSON.stringify(triage)));
    const r = await make(fetchImpl).triage({ text: "redacted", categories });
    expect(r).toEqual({ ok: true, value: triage });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("vendor/some-model");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.schema.properties.priority.enum).toEqual(["low", "normal", "high", "urgent"]);
    // Strict mode on OpenAI-style servers needs closed objects with every field required.
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.response_format.json_schema.schema.required).toHaveLength(6);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("withheld_funds");
  });

  it("asks OpenRouter not to let hosts store or train on the data, and pins hosts when configured", async () => {
    const { fetchImpl, calls } = stubFetch(() => completion(JSON.stringify(triage)));
    await make(fetchImpl, { onlyProviders: ["HostA", "HostB"] }).triage({ text: "x", categories });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.provider).toEqual({ data_collection: "deny", only: ["HostA", "HostB"] });
  });

  it("sends no OpenRouter-only fields to other compatible servers", async () => {
    const { fetchImpl, calls } = stubFetch(() => completion(JSON.stringify(triage)));
    await make(fetchImpl, { name: "openai-compatible", baseUrl: "http://10.0.0.5:8000/v1/", openRouter: false }).triage({ text: "x", categories });
    expect(calls[0].url).toBe("http://10.0.0.5:8000/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init.body)).provider).toBeUndefined();
  });

  it("accepts JSON wrapped in a markdown fence", async () => {
    const { fetchImpl } = stubFetch(() => completion("```json\n" + JSON.stringify(triage) + "\n```"));
    expect((await make(fetchImpl).triage({ text: "x", categories })).ok).toBe(true);
  });

  it("maps malformed or schema-breaking output to invalid_output", async () => {
    const bad = stubFetch(() => completion("not json"));
    expect(await make(bad.fetchImpl).triage({ text: "x", categories })).toEqual({ ok: false, reason: "invalid_output" });
    const wrong = stubFetch(() => completion(JSON.stringify({ ...triage, priority: "extreme" })));
    expect(await make(wrong.fetchImpl).triage({ text: "x", categories })).toEqual({ ok: false, reason: "invalid_output" });
  });

  it("maps refusals and content filters to refused", async () => {
    const refusal = stubFetch(() => completion(null, { refusal: "I can't help with that." }));
    expect(await make(refusal.fetchImpl).triage({ text: "x", categories })).toEqual({ ok: false, reason: "refused" });
    const filtered = stubFetch(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }), { status: 200 }),
    );
    expect(await make(filtered.fetchImpl).triage({ text: "x", categories })).toEqual({ ok: false, reason: "refused" });
  });

  it("maps HTTP errors and network failures to error without leaking the key", async () => {
    const http = stubFetch(() => new Response("{\"error\":\"bad key\"}", { status: 401 }));
    expect(await make(http.fetchImpl).triage({ text: "x", categories })).toEqual({ ok: false, reason: "error" });
    const net = stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    expect(await make(net.fetchImpl).summarizeCase({ complaint: "c", timeline: "t" })).toEqual({ ok: false, reason: "error" });
  });
});

describe("getAiProvider with compatible providers", () => {
  it("builds an OpenRouter provider from env", () => {
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_API_KEY = "sk-or-test";
    process.env.AI_MODEL = "vendor/some-model";
    const p = getAiProvider();
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
    expect(p?.name).toBe("openrouter");
    expect(p?.model).toBe("vendor/some-model");
  });

  it("is off without a key or model, and openai-compatible needs a base URL", () => {
    process.env.AI_PROVIDER = "openrouter";
    process.env.AI_MODEL = "m";
    expect(getAiProvider()).toBeNull();
    resetAiProviderForTests();
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()).toBeNull();
    resetAiProviderForTests();
    process.env.AI_BASE_URL = "http://10.0.0.5:8000/v1";
    expect(getAiProvider()?.name).toBe("openai-compatible");
  });
});
