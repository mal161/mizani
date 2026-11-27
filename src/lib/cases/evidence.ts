import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
}

/**
 * Uploads already-validated evidence files to the private bucket and records document rows.
 * All-or-nothing: on any failure it removes what it uploaded and the rows it wrote, then rethrows.
 * Returns the new documents' ids (for OCR).
 */
export async function uploadEvidence(
  caseId: string,
  files: File[],
  uploadedBy: string,
  visibility: "parties" | "internal" = "parties",
): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];
  const ids: string[] = [];
  try {
    for (const f of files) {
      const path = `${caseId}/${randomUUID()}-${safeName(f.name)}`;
      const up = await admin.storage.from("evidence").upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw new Error(`upload ${f.name}: ${up.error.message}`);
      paths.push(path);
      const { data: doc, error } = await admin.from("documents").insert({
        case_id: caseId,
        storage_path: path,
        file_name: f.name,
        mime: f.type,
        size_bytes: f.size,
        uploaded_by: uploadedBy,
        visibility,
      }).select("id").single();
      if (error) throw new Error(`document row: ${error.message}`);
      ids.push(doc.id as string);
    }
    return ids;
  } catch (e) {
    if (paths.length) {
      await admin.storage.from("evidence").remove(paths);
      await admin.from("documents").delete().in("storage_path", paths);
    }
    throw e;
  }
}
