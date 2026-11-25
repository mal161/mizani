import type { Stage } from "./stages";

// Task 6 implements these; Task 4 ships no-op versions so callers are wired from the start.

export type DeadlineKind = "stage" | "info_request" | "advocate_response";

export async function openStageDeadline(_caseId: string, _stage: Stage): Promise<void> {}

export async function addDeadline(_caseId: string, _kind: DeadlineKind, _dueAt: Date): Promise<string> {
  return "";
}

export async function meetDeadlines(_caseId: string, _kind: DeadlineKind): Promise<void> {}
