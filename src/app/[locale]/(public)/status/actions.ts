"use server";

import { checkStatus } from "@/lib/cases/status-check";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import { clientIp } from "@/lib/request-ip";
import type { Stage } from "@/lib/cases/stages";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";

export type StatusState =
  | { status: "idle" }
  | { status: "found"; caseNumber: string; stage: Stage; label?: string; updatedAt: string }
  | { status: "error"; reason: "bad_case_number" | "invalid" | "locked" };

export async function statusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const caseNumber = parseCaseNumberInput(String(formData.get("caseNumber") ?? ""));
  if (!caseNumber) return { status: "error", reason: "bad_case_number" };
  const r = await checkStatus(caseNumber, String(formData.get("pin") ?? "").trim(), "web", await clientIp());
  if (!r.ok) return { status: "error", reason: r.reason };
  const locale = formData.get("locale") === "sw" ? "sw" : "en";
  const label = (await loadWorkflowConfig()).stageLabels[locale]?.[r.stage];
  return { status: "found", caseNumber, stage: r.stage, label, updatedAt: r.updatedAt };
}
