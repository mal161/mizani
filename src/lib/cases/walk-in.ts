import { normalizeKenyanPhone } from "@/lib/phone";
import { ensureComplainantForPhone, createWalkInComplainant } from "@/lib/auth/accounts";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import type { Locale } from "@/i18n/routing";
import type { ComplaintInput } from "./schema";
import { complaintSchema, validateEvidence } from "./schema";
import { fileComplaint, ComplaintValidationError, type FiledCase } from "./file-complaint";
import { afterFiling, type Scheduler } from "./after-filing";
import { logAudit } from "@/lib/audit";

export interface WalkInForm extends ComplaintInput {
  fullName: string;
  phone?: string;
  /** The phone typed a second time; must match `phone` (guards against texting a stranger the PIN). */
  phoneConfirm?: string;
}

/**
 * Files a complaint brought in person. Only officers and admins may do this. Validates everything before
 * creating any account, so a bad form never leaves an orphan complainant behind.
 */
export async function fileWalkInComplaintAs(
  actor: StaffUser,
  form: WalkInForm,
  files: File[],
  schedule?: Scheduler,
): Promise<FiledCase> {
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
    if (normalizeKenyanPhone(form.phoneConfirm ?? "") !== phone) {
      throw new ComplaintValidationError("invalid_input", ["phoneConfirm"]);
    }
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
  await logAudit({ actorId: actor.id, channel: "web", action: "file_walk_in", entity: "cases", entityId: filed.caseId, details: { office: actor.office ?? null, with_phone: Boolean(form.phone?.trim()) } });
  await afterFiling(filed.caseId, schedule);
  return filed;
}
