import { z } from "zod";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;

export const complaintSchema = z.object({
  advocateId: z.uuid().optional(),
  advocateNameGiven: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(10).max(200),
  description: z.string().trim().min(30).max(10000),
  language: z.enum(["en", "sw"]),
  consentDataProcessing: z.literal(true),
});

export type ComplaintInput = z.infer<typeof complaintSchema>;

export type EvidenceError = "too_many_files" | "file_too_large" | "file_type";

/** Drops empty file inputs and checks count, size and type. Returns null when valid. */
export function realFiles(files: File[]): File[] {
  return files.filter((f) => f.size > 0 && f.name !== "");
}

export function validateEvidence(files: File[]): EvidenceError | null {
  const real = realFiles(files);
  if (real.length > MAX_FILES) return "too_many_files";
  for (const f of real) {
    if (f.size > MAX_FILE_BYTES) return "file_too_large";
    if (!(ALLOWED_MIME as readonly string[]).includes(f.type)) return "file_type";
  }
  return null;
}
