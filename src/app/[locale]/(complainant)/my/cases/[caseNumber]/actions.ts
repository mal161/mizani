"use server";

import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { respondToInfoRequest } from "@/lib/cases/respond";
import { ComplaintValidationError } from "@/lib/cases/file-complaint";
import { queueOcr } from "@/lib/ocr/run";

export type RespondState = { status: "idle" | "sent" | "error"; reason?: string };

export async function respondAction(_prev: RespondState, formData: FormData): Promise<RespondState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "complainant") return { status: "error", reason: "not_signed_in" };
  const caseId = String(formData.get("caseId") ?? "");
  try {
    const documentIds = await respondToInfoRequest(
      caseId,
      user.id,
      String(formData.get("text") ?? ""),
      formData.getAll("evidence").filter((f): f is File => f instanceof File),
    );
    queueOcr(documentIds, (task) => after(task));
  } catch (e) {
    if (e instanceof ComplaintValidationError) return { status: "error", reason: e.reason };
    console.error("respond failed", e);
    return { status: "error", reason: "server" };
  }
  // No revalidation: re-rendering would remove the request box (and this confirmation) immediately.
  return { status: "sent" };
}
