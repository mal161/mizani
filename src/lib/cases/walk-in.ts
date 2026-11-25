import { normalizeKenyanPhone } from "@/lib/phone";
import { ensureComplainantForPhone, createWalkInComplainant } from "@/lib/auth/accounts";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import type { Locale } from "@/i18n/routing";
import type { ComplaintInput } from "./schema";
import { complaintSchema, validateEvidence } from "./schema";
import { fileComplaint, ComplaintValidationError, type FiledCase } from "./file-complaint";
import { afterFiling } from "./after-filing";

export interface WalkInForm extends ComplaintInput {
  fullName: string;
  phone?: string;
}

/**
 * Files a complaint brought in person. Only officers and admins may do this. Validates everything before
 * creating any account, so a bad form never leaves an orphan complainant behind.
 */
export async function fileWalkInComplaintAs(actor: StaffUser, form: WalkInForm, files: File[]): Promise<FiledCase> {
  if (actor.role !== "staff" && actor.role !== "admin") throw new ForbiddenError();

  const fullName = form.fullName.trim();
  if (fullName.length < 2 || fullName.length > 120) throw new ComplaintValidationError("invalid_input", ["fullName"]);
  const parsed = complaintSchema.safeParse(form);
  if (!parsed.success) {
    throw new ComplaintValidationError("invalid_input", parsed.error.issues.map((i) => String(i.path[0])));
  }
  const evidenceError = validateEvidence(files);
  if (evidenceError) throw new ComplaintValidationError(evidenceError);

  const locale: Locale = form.language;
  let complainantId: string;
  if (form.phone?.trim()) {
    const phone = normalizeKenyanPhone(form.phone);
    if (!phone) throw new ComplaintValidationError("invalid_input", ["phone"]);
    complainantId = await ensureComplainantForPhone(phone, locale, fullName);
  } else {
    complainantId = await createWalkInComplainant(fullName, locale);
  }

  const filed = await fileComplaint(form, files, {
    complainantId,
    filedBy: actor.id,
    channel: "walk_in",
    locale,
    office: actor.office ?? undefined,
  });
  await afterFiling(filed.caseId);
  return filed;
}
