"use server";

import { checkStatus, type StatusActions } from "@/lib/cases/status-check";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import { clientIp } from "@/lib/request-ip";
import type { Stage } from "@/lib/cases/stages";
import { loadWorkflowConfig } from "@/lib/cases/load-workflow";

export type StatusState =
  | { status: "idle" }
  | {
      status: "found";
      caseNumber: string;
      stage: Stage;
      stageSince: string;
      actions: StatusActions;
      /** Stage names an admin renamed in Workflow settings, for this language. */
      labels: Partial<Record<Stage, string>>;
    }
  | { status: "error"; reason: "bad_case_number" | "invalid" | "locked" };

export async function statusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const caseNumber = parseCaseNumberInput(String(formData.get("caseNumber") ?? ""));
  if (!caseNumber) return { status: "error", reason: "bad_case_number" };
  const r = await checkStatus(caseNumber, String(formData.get("pin") ?? "").trim(), "web", await clientIp());
  if (!r.ok) return { status: "error", reason: r.reason };
  const locale = formData.get("locale") === "sw" ? "sw" : "en";
  const labels = (await loadWorkflowConfig()).stageLabels[locale] ?? {};
  return { status: "found", caseNumber, stage: r.stage, stageSince: r.stageSince, actions: r.actions, labels };
}
