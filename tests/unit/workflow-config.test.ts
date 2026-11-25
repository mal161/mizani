import { describe, it, expect } from "vitest";
import {
  TRANSITIONS,
  DEFAULT_WORKFLOW,
  allowedNextStages,
  slaDaysFor,
  labelFor,
  parseWorkflowConfig,
  type WorkflowConfig,
} from "@/lib/cases/workflow-config";
import { STAGES } from "@/lib/cases/stages";

const cfg: WorkflowConfig = { ...DEFAULT_WORKFLOW, advocateResponseDays: 21 };
const t = (s: string) => `T:${s}`;

describe("workflow config", () => {
  it("has the default transitions", () => {
    expect(TRANSITIONS.received).toEqual(["screening"]);
    expect(TRANSITIONS.screening).toEqual(["advocate_notified", "closed"]);
    expect(TRANSITIONS.decision).toEqual(["closed"]);
  });

  it("every stage except closed can move on", () => {
    for (const s of STAGES) {
      if (s === "closed") expect(TRANSITIONS[s]).toEqual([]);
      else expect(TRANSITIONS[s].length).toBeGreaterThan(0);
    }
  });

  it("drops conciliation when disabled", () => {
    expect(allowedNextStages("investigation", cfg)).toEqual(["conciliation", "hearing", "closed"]);
    expect(allowedNextStages("investigation", { ...cfg, conciliationEnabled: false })).toEqual(["hearing", "closed"]);
    expect(allowedNextStages("closed", cfg)).toEqual([]);
  });

  it("uses the advocate response window for advocate_notified and none for closed", () => {
    expect(slaDaysFor("advocate_notified", cfg)).toBe(21);
    expect(slaDaysFor("investigation", cfg)).toBe(30);
    expect(slaDaysFor("closed", cfg)).toBeNull();
  });

  it("labels: admin override first, translation otherwise", () => {
    const withOverride = { ...cfg, stageLabels: { en: { screening: "Admissibility review" }, sw: {} } };
    expect(labelFor("screening", "en", withOverride, t)).toBe("Admissibility review");
    expect(labelFor("screening", "sw", withOverride, t)).toBe("T:screening");
  });

  it("parses stored settings, falling back to defaults for missing or bad values", () => {
    const parsed = parseWorkflowConfig([
      { key: "sla_days", value: { investigation: 45 } },
      { key: "conciliation_enabled", value: false },
      { key: "advocate_response_days", value: 14 },
      { key: "categories", value: "not-an-array" },
    ]);
    expect(parsed.slaDays.investigation).toBe(45);
    expect(parsed.slaDays.hearing).toBe(14);
    expect(parsed.conciliationEnabled).toBe(false);
    expect(parsed.categories).toEqual(DEFAULT_WORKFLOW.categories);
  });
});
