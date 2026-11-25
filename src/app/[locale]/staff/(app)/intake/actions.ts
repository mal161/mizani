"use server";

import { hasLocale } from "next-intl";
import { assertStaff, ForbiddenError } from "@/lib/auth/staff";
import { fileWalkInComplaintAs } from "@/lib/cases/walk-in";
import { ComplaintValidationError } from "@/lib/cases/file-complaint";
import { routing, type Locale } from "@/i18n/routing";

export type IntakeState =
  | { status: "idle" }
  | { status: "error"; reason: string; fields: string[]; values: Record<string, string> }
  | { status: "filed"; caseNumber: string; pin: string; office: string | null; filedAt: string };

export async function walkInAction(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const lang = String(formData.get("language"));
  const language: Locale = hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
  const values = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    phoneConfirm: String(formData.get("phoneConfirm") ?? ""),
    advocateId: String(formData.get("advocateId") ?? ""),
    advocateNameGiven: String(formData.get("advocateNameGiven") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    description: String(formData.get("description") ?? ""),
    language,
  };
  try {
    const actor = await assertStaff(["staff", "admin"]);
    const r = await fileWalkInComplaintAs(
      actor,
      {
        fullName: values.fullName,
        phone: values.phone || undefined,
        phoneConfirm: values.phoneConfirm || undefined,
        advocateId: values.advocateId || undefined,
        advocateNameGiven: values.advocateNameGiven,
        summary: values.summary,
        description: values.description,
        language,
        consentDataProcessing: formData.get("consent") === "on" ? true : (false as unknown as true),
      },
      formData.getAll("evidence").filter((f): f is File => f instanceof File),
    );
    return { status: "filed", caseNumber: r.caseNumber, pin: r.pin, office: actor.office ?? null, filedAt: new Date().toISOString() };
  } catch (e) {
    if (e instanceof ForbiddenError) return { status: "error", reason: "forbidden", fields: [], values };
    if (e instanceof ComplaintValidationError) return { status: "error", reason: e.reason, fields: e.fields, values };
    console.error("walk-in intake failed", e);
    return { status: "error", reason: "server", fields: [], values };
  }
}
