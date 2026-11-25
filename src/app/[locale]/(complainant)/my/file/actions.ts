"use server";

import { hasLocale } from "next-intl";
import { getCurrentUser } from "@/lib/auth/session";
import { fileComplaint, ComplaintValidationError } from "@/lib/cases/file-complaint";
import { afterFiling } from "@/lib/cases/after-filing";
import { routing, type Locale } from "@/i18n/routing";

export type FileState =
  | { status: "idle" }
  | { status: "error"; reason: string; fields: string[]; values: Record<string, string> }
  | { status: "filed"; caseNumber: string; pin: string };

export async function fileComplaintAction(_prev: FileState, formData: FormData): Promise<FileState> {
  const l = String(formData.get("locale"));
  const locale: Locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const values = {
    advocateId: String(formData.get("advocateId") ?? ""),
    advocateNameGiven: String(formData.get("advocateNameGiven") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const user = await getCurrentUser();
  if (!user || user.role !== "complainant") {
    return { status: "error", reason: "not_signed_in", fields: [], values };
  }

  try {
    const r = await fileComplaint(
      {
        advocateId: values.advocateId || undefined,
        advocateNameGiven: values.advocateNameGiven,
        summary: values.summary,
        description: values.description,
        language: locale,
        consentDataProcessing: formData.get("consent") === "on" ? true : (false as unknown as true),
      },
      formData.getAll("evidence").filter((f): f is File => f instanceof File),
      { complainantId: user.id, filedBy: user.id, channel: "online", locale },
    );
    await afterFiling(r.caseId);
    return { status: "filed", caseNumber: r.caseNumber, pin: r.pin };
  } catch (e) {
    if (e instanceof ComplaintValidationError) {
      return { status: "error", reason: e.reason, fields: e.fields, values };
    }
    console.error("fileComplaintAction failed", e);
    return { status: "error", reason: "server", fields: [], values };
  }
}
