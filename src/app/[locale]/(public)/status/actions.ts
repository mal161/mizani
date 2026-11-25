"use server";

import { checkStatus } from "@/lib/cases/status-check";
import { parseCaseNumberInput } from "@/lib/cases/case-number";
import type { Stage } from "@/lib/cases/stages";

export type StatusState =
  | { status: "idle" }
  | { status: "found"; caseNumber: string; stage: Stage; updatedAt: string }
  | { status: "error"; reason: "bad_case_number" | "invalid" | "locked" };

export async function statusAction(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const caseNumber = parseCaseNumberInput(String(formData.get("caseNumber") ?? ""));
  if (!caseNumber) return { status: "error", reason: "bad_case_number" };
  const r = await checkStatus(caseNumber, String(formData.get("pin") ?? "").trim(), "web");
  return r.ok
    ? { status: "found", caseNumber, stage: r.stage, updatedAt: r.updatedAt }
    : { status: "error", reason: r.reason };
}
