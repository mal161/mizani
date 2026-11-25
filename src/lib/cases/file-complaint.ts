import { randomUUID } from "node:crypto";
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
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
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

  const uploaded: string[] = [];
  try {
    for (const f of evidence) {
      const path = `${caseId}/${randomUUID()}-${safeName(f.name)}`;
      const up = await admin.storage
        .from("evidence")
        .upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw new Error(`upload ${f.name}: ${up.error.message}`);
      uploaded.push(path);
      const { error } = await admin.from("documents").insert({
        case_id: caseId,
        storage_path: path,
        file_name: f.name,
        mime: f.type,
        size_bytes: f.size,
        uploaded_by: ctx.filedBy,
        visibility: "parties",
      });
      if (error) throw new Error(`document row: ${error.message}`);
    }
    const { error: evErr } = await admin.from("case_events").insert({
      case_id: caseId,
      type: "filed",
      visibility: "parties",
      actor_id: ctx.filedBy,
      body: { channel: ctx.channel, documents: evidence.length },
    });
    if (evErr) throw new Error(`filed event: ${evErr.message}`);
  } catch (e) {
    if (uploaded.length) await admin.storage.from("evidence").remove(uploaded);
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
  return { caseId, caseNumber, pin };
}
