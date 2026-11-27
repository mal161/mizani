"use server";

import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { submitAdvocateResponse } from "@/lib/advocates/respond";
import { ComplaintValidationError } from "@/lib/cases/file-complaint";
import { queueOcr } from "@/lib/ocr/run";

export type AdvocateResponseState = { status: "idle" | "sent" | "error"; reason?: string; late?: boolean };

export async function advocateRespondAction(_prev: AdvocateResponseState, formData: FormData): Promise<AdvocateResponseState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "advocate" || user.active === false) return { status: "error", reason: "not_signed_in" };
  try {
    const r = await submitAdvocateResponse(
      user.id,
      String(formData.get("caseId") ?? ""),
      String(formData.get("text") ?? ""),
      formData.getAll("evidence").filter((f): f is File => f instanceof File),
    );
    queueOcr(r.documentIds, (task) => after(task));
    return { status: "sent", late: r.late };
  } catch (e) {
    if (e instanceof ComplaintValidationError) return { status: "error", reason: e.reason };
    console.error("advocate response failed", e);
    return { status: "error", reason: "server" };
  }
}
