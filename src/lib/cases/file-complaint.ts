import { createAdminClient } from "@/lib/supabase/admin";
import { generatePin, hashPin } from "@/lib/pin";
import { getSmsProvider } from "@/lib/sms";
import type { Locale } from "@/i18n/routing";
import {
  complaintSchema,
  realFiles,
  validateEvidence,
  type ComplaintInput,
  type EvidenceError,
} from "./schema";
import { smsText } from "./messages";
import { uploadEvidence } from "./evidence";

export class ComplaintValidationError extends Error {
  constructor(
    public reason: "invalid_input" | EvidenceError,
    public fields: string[] = [],
  ) {
    super(reason);
  }
}

export interface FileContext {
  complainantId: string;
  filedBy: string;
  channel: "online" | "walk_in";
  locale: Locale;
  office?: string;
}

export interface FiledCase {
  caseId: string;
  caseNumber: string;
  pin: string;
  /** Uploaded evidence, for OCR after the response. */
  documentIds: string[];
}

/**
 * Files a complaint on behalf of a complainant (online or walk-in). Validation happens before any write;
 * if evidence upload fails, the case and any uploaded objects are removed.
 * Runs with the service role: callers must have authorised complainantId/filedBy.
 */
export async function fileComplaint(
  raw: ComplaintInput,
  files: File[],
  ctx: FileContext,
): Promise<FiledCase> {
  const parsed = complaintSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ComplaintValidationError(
      "invalid_input",
      parsed.error.issues.map((i) => String(i.path[0])),
    );
  }
  const evidenceError = validateEvidence(files);
  if (evidenceError) throw new ComplaintValidationError(evidenceError);
  const input = parsed.data;
  const evidence = realFiles(files);

  const admin = createAdminClient();
  const { data: caseNumber, error: numErr } = await admin.rpc("next_case_number");
  if (numErr) throw new Error(`case number: ${numErr.message}`);
  const pin = generatePin();

  const { data: created, error: insErr } = await admin
    .from("cases")
    .insert({
      case_number: caseNumber,
      complainant_id: ctx.complainantId,
      filed_by: ctx.filedBy,
      advocate_id: input.advocateId ?? null,
      advocate_name_given: input.advocateNameGiven,
      summary: input.summary,
      description: input.description,
      language: input.language,
      channel: ctx.channel,
      office: ctx.office ?? null,
      pin_hash: await hashPin(pin),
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`create case: ${insErr.message}`);
  const caseId = created.id as string;

  let documentIds: string[] = [];
  try {
    documentIds = await uploadEvidence(caseId, evidence, ctx.filedBy);
    const { error: evErr } = await admin.from("case_events").insert({
      case_id: caseId,
      type: "filed",
      visibility: "parties",
      actor_id: ctx.filedBy,
      body: { channel: ctx.channel, documents: evidence.length },
    });
    if (evErr) throw new Error(`filed event: ${evErr.message}`);
  } catch (e) {
    // Documents cascade with the case; remove stored files too.
    const { data: left } = await admin.storage.from("evidence").list(caseId);
    if (left?.length) await admin.storage.from("evidence").remove(left.map((o) => `${caseId}/${o.name}`));
    await admin.from("cases").delete().eq("id", caseId);
    throw e;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", ctx.complainantId)
    .maybeSingle();
  if (profile?.phone) {
    try {
      await getSmsProvider().send(profile.phone, smsText.filed(ctx.locale, caseNumber, pin));
    } catch (e) {
      // The case is filed; a failed SMS must not undo it. Record it for staff follow-up.
      await admin.from("case_events").insert({
        case_id: caseId,
        type: "sms_failed",
        visibility: "internal",
        body: { error: String(e) },
      });
    }
  }
  return { caseId, caseNumber, pin, documentIds };
}
