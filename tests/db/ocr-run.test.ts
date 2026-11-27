import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { fileComplaint } from "@/lib/cases/file-complaint";
import { uploadEvidence } from "@/lib/cases/evidence";
import { getOcrProvider, resetOcrProviderForTests, OcrError } from "@/lib/ocr";
import type { FakeOcrProvider } from "@/lib/ocr/fake";
import { MAX_OCR_ATTEMPTS, queueOcr, runOcr, sweepOcr } from "@/lib/ocr/run";
import { adminClient, signInAs, makeCase } from "../helpers/db";
import { makeTextPdf } from "../helpers/pdf";

const input = {
  advocateNameGiven: "Test Advocate",
  summary: "Advocate kept my money",
  description: "I paid the advocate and the money was never returned to me after the sale.",
  language: "en" as const,
  consentDataProcessing: true as const,
};
const png = (name: string) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], name, { type: "image/png" });

let userId: string;
const fake = () => getOcrProvider() as FakeOcrProvider;
const row = async (id: string) =>
  (await adminClient().from("document_texts").select("*").eq("document_id", id).maybeSingle()).data;

async function setOcrEnabled(value: boolean) {
  await adminClient().from("settings").upsert({ key: "ocr_enabled", value });
}

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  process.env.OCR_PROVIDER = "fake";
  resetOcrProviderForTests();
  ({ userId } = await signInAs("complainant", "+254700008201"));
  await setOcrEnabled(true);
});
beforeEach(() => {
  process.env.OCR_PROVIDER = "fake";
  resetOcrProviderForTests();
  fake().calls.length = 0;
});
afterAll(async () => {
  await setOcrEnabled(true);
});

describe("runOcr", () => {
  it("reads a scanned image uploaded with a complaint", async () => {
    const r = await fileComplaint(input, [png("receipt.png")], { complainantId: userId, filedBy: userId, channel: "online", locale: "en" });
    expect(r.documentIds).toHaveLength(1);
    expect(await runOcr(r.documentIds[0])).toBe("done");
    expect(await row(r.documentIds[0])).toMatchObject({
      status: "done",
      text: "Scanned text of receipt.png",
      confidence: 90,
      page_count: 1,
      engine: "fake",
      attempts: 1,
      error: null,
      claimed_at: null,
    });
  });

  it("skips a PDF that already has a text layer", async () => {
    const kase = await makeCase(userId);
    const pdf = new File([makeTextPdf(["This letter already has text in it."])], "letter.pdf", { type: "application/pdf" });
    const [id] = await uploadEvidence(kase.id, [pdf], userId);
    expect(await runOcr(id)).toBe("skipped");
    expect(fake().calls).toHaveLength(0);
  });

  it("stops retrying after the attempt limit", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("ocr-fail.png")], userId);
    expect(await runOcr(id)).toBe("failed");
    expect((await row(id))?.attempts).toBe(1);
    await sweepOcr({ caseId: kase.id });
    await sweepOcr({ caseId: kase.id });
    expect((await row(id))?.attempts).toBe(MAX_OCR_ATTEMPTS);
    const calls = fake().calls.length;
    await sweepOcr({ caseId: kase.id });
    expect(fake().calls.length).toBe(calls);
  });

  it("does not retry an input error", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("big.png")], userId);
    fake().failNext(new OcrError("file_too_large", false));
    expect(await runOcr(id)).toBe("failed");
    expect(await row(id)).toMatchObject({ status: "failed", error: "file_too_large", attempts: MAX_OCR_ATTEMPTS });
  });

  it("reads a document once when two readers start together", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("twice.png")], userId);
    await Promise.all([runOcr(id), runOcr(id)]);
    expect(fake().calls.filter((c) => c.fileName === "twice.png")).toHaveLength(1);
    expect((await row(id))?.status).toBe("done");
  });

  it("does nothing while an admin has switched OCR off", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("off.png")], userId);
    await setOcrEnabled(false);
    try {
      expect(await runOcr(id)).toBe("off");
      expect(await row(id)).toBeNull();
      expect(await sweepOcr({ caseId: kase.id })).toEqual({ processed: 0 });
      expect(fake().calls).toHaveLength(0);
    } finally {
      await setOcrEnabled(true);
    }
  });

  it("does nothing when no OCR provider is configured", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("none.png")], userId);
    process.env.OCR_PROVIDER = "none";
    resetOcrProviderForTests();
    expect(await runOcr(id)).toBe("off");
    expect(await row(id)).toBeNull();
  });
});

describe("sweepOcr and queueOcr", () => {
  it("reads documents uploaded before OCR existed", async () => {
    const kase = await makeCase(userId);
    const [id] = await uploadEvidence(kase.id, [png("old-scan.png")], userId);
    expect(await row(id)).toBeNull();
    const r = await sweepOcr({ caseId: kase.id });
    expect(r.processed).toBe(1);
    expect((await row(id))?.status).toBe("done");
  });

  it("schedules one read per document", async () => {
    const kase = await makeCase(userId);
    const ids = await uploadEvidence(kase.id, [png("a.png"), png("b.png")], userId);
    const tasks: (() => Promise<void>)[] = [];
    queueOcr(ids, (t) => tasks.push(t));
    expect(tasks).toHaveLength(2);
    await Promise.all(tasks.map((t) => t()));
    expect((await row(ids[0]))?.status).toBe("done");
    expect((await row(ids[1]))?.status).toBe("done");
  });
});
