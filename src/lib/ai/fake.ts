import type { AiFailure, AiProvider, AiResult, SummaryInput, TriageInput } from "./provider";
import type { Triage, CaseSummary } from "./schemas";

/** Deterministic stand-in for tests and key-less demos. Never calls a network. */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly model = "fake-1";
  calls: { kind: "triage" | "summary"; input: TriageInput | SummaryInput }[] = [];
  private nextFailure: AiFailure | null = null;
  private nextCategory: string | null = null;

  failNext(reason: AiFailure) {
    this.nextFailure = reason;
  }

  /** Makes the next triage return this category (even one outside the allowed list). */
  categoryNext(category: string) {
    this.nextCategory = category;
  }

  private takeFailure(): AiFailure | null {
    const f = this.nextFailure;
    this.nextFailure = null;
    return f;
  }

  async triage(input: TriageInput): Promise<AiResult<Triage>> {
    this.calls.push({ kind: "triage", input });
    const fail = this.takeFailure();
    if (fail) return { ok: false, reason: fail };
    const lower = input.text.toLowerCase();
    const forced = this.nextCategory;
    this.nextCategory = null;
    const category =
      forced ?? input.categories.find((c) => lower.includes(c.replace(/_/g, " "))) ?? (input.categories.includes("other") ? "other" : input.categories[0]);
    const high = /money|pesa|kes|ksh|withheld/.test(lower);
    const gist = input.text.replace(/\s+/g, " ").slice(0, 120);
    return {
      ok: true,
      value: {
        category,
        priority: high ? "high" : "normal",
        urgency_reasons: high ? ["Money or property is said to be withheld"] : [],
        summary_en: `(demo AI) ${gist}`,
        summary_sw: `(AI ya majaribio) ${gist}`,
        language: /\b(wakili|pesa|nili|yangu)\b/.test(lower) ? "sw" : "en",
      },
    };
  }

  async summarizeCase(input: SummaryInput): Promise<AiResult<CaseSummary>> {
    this.calls.push({ kind: "summary", input });
    const fail = this.takeFailure();
    if (fail) return { ok: false, reason: fail };
    const gist = input.complaint.replace(/\s+/g, " ").slice(0, 160);
    return {
      ok: true,
      value: {
        summary_en: `(demo AI) ${gist}`,
        summary_sw: `(AI ya majaribio) ${gist}`,
        key_dates: [],
        open_questions: ["(demo AI) What documents support the complaint?"],
      },
    };
  }
}
