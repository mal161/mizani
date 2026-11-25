import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { fileComplaint, ComplaintValidationError } from "@/lib/cases/file-complaint";
import { verifyPin } from "@/lib/pin";
import { getSmsProvider } from "@/lib/sms";
import type { FakeSms } from "@/lib/sms/fake";
import { adminClient, signInAs } from "../helpers/db";

const input = {
  advocateNameGiven: "Baraka Kiprono",
  summary: "Advocate did not file my land case",
  description: "I paid the advocate in January to file my land case and nothing has been filed since then.",
  language: "sw" as const,
  consentDataProcessing: true as const,
};

let userId: string;
const fake = () => getSmsProvider() as FakeSms;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  ({ userId } = await signInAs("complainant", "+254700000601"));
});
beforeEach(() => {
  fake().sent.length = 0;
});

describe("fileComplaint", () => {
  it("creates the case, stores only the PIN hash, writes a filed event, uploads evidence and sends SMS", async () => {
    const pdf = new File([new Uint8Array(2048)], "receipt.pdf", { type: "application/pdf" });
    const r = await fileComplaint(input, [pdf], {
      complainantId: userId,
      filedBy: userId,
      channel: "online",
      locale: "sw",
    });
    expect(r.caseNumber).toMatch(/^ACC\/\d{4}\/\d{6}$/);
    expect(r.pin).toMatch(/^\d{6}$/);

    const admin = adminClient();
    const { data: c } = await admin.from("cases").select("*").eq("id", r.caseId).single();
    expect(c.pin_hash).not.toBe(r.pin);
    expect(await verifyPin(r.pin, c.pin_hash)).toBe(true);
    expect(c.stage).toBe("received");
    expect(c.language).toBe("sw");

    const { data: ev } = await admin.from("case_events").select("type,visibility").eq("case_id", r.caseId);
    expect(ev).toEqual([{ type: "filed", visibility: "parties" }]);

    const { data: docs } = await admin.from("documents").select("file_name,size_bytes,storage_path").eq("case_id", r.caseId);
    expect(docs).toHaveLength(1);
    expect(docs![0]).toMatchObject({ file_name: "receipt.pdf", size_bytes: 2048 });
    const dl = await admin.storage.from("evidence").download(docs![0].storage_path);
    expect(dl.error).toBeNull();

    expect(fake().sent).toHaveLength(1);
    expect(fake().sent[0].to).toBe("+254700000601");
    expect(fake().sent[0].message).toContain(r.caseNumber);
  });

  it("rejects a bad file before creating anything", async () => {
    const admin = adminClient();
    const before = await admin.from("cases").select("id", { count: "exact", head: true }).eq("complainant_id", userId);
    const exe = new File([new Uint8Array(10)], "virus.exe", { type: "application/x-msdownload" });
    await expect(
      fileComplaint(input, [exe], { complainantId: userId, filedBy: userId, channel: "online", locale: "en" }),
    ).rejects.toBeInstanceOf(ComplaintValidationError);
    const after = await admin.from("cases").select("id", { count: "exact", head: true }).eq("complainant_id", userId);
    expect(after.count).toBe(before.count);
    expect(fake().sent).toHaveLength(0);
  });

  it("rejects invalid input", async () => {
    await expect(
      fileComplaint({ ...input, summary: "x" }, [], { complainantId: userId, filedBy: userId, channel: "online", locale: "en" }),
    ).rejects.toBeInstanceOf(ComplaintValidationError);
  });
});
