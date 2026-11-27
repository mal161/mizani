import { describe, it, expect, beforeAll } from "vitest";
import { uploadEvidence } from "@/lib/cases/evidence";
import { resetOcrProviderForTests } from "@/lib/ocr";
import { rereadDocumentTextAs } from "@/lib/ocr/run";
import { ForbiddenError, type StaffUser } from "@/lib/auth/staff-types";
import { adminClient, signInAs, signInStaff, makeCase } from "../helpers/db";

let officer: StaffUser;
let commissioner: StaffUser;
let documentId: string;
const row = async () => (await adminClient().from("document_texts").select("*").eq("document_id", documentId).single()).data;

beforeAll(async () => {
  process.env.OCR_PROVIDER = "fake";
  resetOcrProviderForTests();
  const stamp = Date.now();
  const s = await signInStaff("staff", `ocr-reread-staff-${stamp}@test.mizani.local`);
  officer = { id: s.userId, role: "staff", phone: null };
  const c = await signInStaff("commissioner", `ocr-reread-comm-${stamp}@test.mizani.local`);
  commissioner = { id: c.userId, role: "commissioner", phone: null };
  const { userId } = await signInAs("complainant", "+254700008301");
  const kase = await makeCase(userId);
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])], "faded.png", { type: "image/png" });
  [documentId] = await uploadEvidence(kase.id, [png], userId);
  await adminClient()
    .from("document_texts")
    .insert({ document_id: documentId, status: "failed", error: "engine_error", attempts: 3 });
});

describe("rereadDocumentTextAs", () => {
  it("is not allowed for commissioners", async () => {
    await expect(rereadDocumentTextAs(commissioner, documentId, () => {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(await row()).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("gives an officer's document fresh attempts and reads it again", async () => {
    const tasks: (() => Promise<void>)[] = [];
    await rereadDocumentTextAs(officer, documentId, (t) => tasks.push(t));
    expect(await row()).toMatchObject({ status: "pending", attempts: 0, error: null });
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    expect(await row()).toMatchObject({ status: "done", text: "Scanned text of faded.png", attempts: 1 });
    const { data: audit } = await adminClient()
      .from("audit_log")
      .select("actor_id")
      .eq("action", "ocr_reread")
      .eq("entity_id", documentId);
    expect(audit).toEqual([{ actor_id: officer.id }]);
  });
});
