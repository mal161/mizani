import { describe, it, expect, beforeAll } from "vitest";
import { checkStatus } from "@/lib/cases/status-check";
import { fileComplaint } from "@/lib/cases/file-complaint";
import { adminClient, signInAs } from "../helpers/db";

let caseNumber: string;
let pin: string;
let caseId: string;

beforeAll(async () => {
  process.env.SMS_PROVIDER = "fake";
  const { userId } = await signInAs("complainant", "+254700000801");
  const r = await fileComplaint(
    {
      advocateNameGiven: "Status Test Advocate",
      summary: "Status check test complaint",
      description: "Testing that the status check returns the stage for the right PIN only.",
      language: "en",
      consentDataProcessing: true,
    },
    [],
    { complainantId: userId, filedBy: userId, channel: "online", locale: "en" },
  );
  ({ caseNumber, pin, caseId } = r);
});

// A fresh caller per run: lockouts count per caller per case per hour, so a fixed name fails on the fifth run within an hour.
const CALLER = `test-caller-${Date.now()}`;
const wrong = () => (pin === "000000" ? "111111" : "000000");

describe("checkStatus", () => {
  it("returns the stage for the right PIN and audits it", async () => {
    const r = await checkStatus(caseNumber, pin, "web", CALLER);
    expect(r).toMatchObject({ ok: true, stage: "received" });
    const { data } = await adminClient()
      .from("audit_log")
      .select("actor_channel,details")
      .eq("entity_id", caseId)
      .eq("action", "status_check");
    expect(data!.some((d) => d.actor_channel === "web" && d.details.ok === true)).toBe(true);
  });

  it("unknown case and wrong PIN both return 'invalid'", async () => {
    expect(await checkStatus("ACC/1999/999999", "123456", "ussd", CALLER)).toEqual({ ok: false, reason: "invalid" });
    expect(await checkStatus(caseNumber, wrong(), "ussd", CALLER)).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks the case after 5 failures in an hour, even for the right PIN", async () => {
    // one failure already recorded above
    for (let i = 0; i < 4; i++) await checkStatus(caseNumber, wrong(), "ussd", CALLER);
    expect(await checkStatus(caseNumber, wrong(), "ussd", CALLER)).toEqual({ ok: false, reason: "locked" });
    expect(await checkStatus(caseNumber, pin, "ussd", CALLER)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("checkStatus — what the public result says", () => {
  it("says when the case entered its stage and whether the complainant needs to act, and nothing personal", async () => {
    const { userId } = await signInAs("complainant", "+254700000802");
    const filed = await fileComplaint(
      {
        advocateNameGiven: "Status Detail Advocate",
        summary: "Status detail test complaint",
        description: "Testing the stage date and the action flags on the public status check.",
        language: "en",
        consentDataProcessing: true,
      },
      [],
      { complainantId: userId, filedBy: userId, channel: "online", locale: "en" },
    );
    const caller = `detail-${Date.now()}`;
    const admin = adminClient();

    const first = await checkStatus(filed.caseNumber, filed.pin, "web", caller);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.keys(first).sort()).toEqual(["actions", "ok", "stage", "stageSince"]);
    expect(first.actions).toEqual({ infoRequested: false, hearingScheduled: false, decisionIssued: false });
    const { data: c } = await admin.from("cases").select("created_at").eq("id", filed.caseId).single();
    expect(new Date(first.stageSince).getTime()).toBe(new Date(c!.created_at).getTime());

    const movedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await admin.from("cases").update({ stage: "hearing" }).eq("id", filed.caseId);
    // Separate inserts: a batch where only one row sets created_at would send null for the other.
    await admin
      .from("case_events")
      .insert({ case_id: filed.caseId, type: "stage_changed", visibility: "parties", body: { from: "received", to: "hearing" }, created_at: movedAt });
    await admin.from("case_events").insert({ case_id: filed.caseId, type: "info_requested", visibility: "parties", body: { message: "Send the receipts." } });
    await admin.from("hearings").insert({
      case_id: filed.caseId,
      starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      mode: "in_person",
      venue: "Room 1",
      panel: [userId],
    });
    await admin.from("decisions").insert({
      case_id: filed.caseId,
      outcome: "dismissed",
      reasons: "The panel found no evidence that the advocate failed in any duty owed to the complainant.",
      panel: [userId],
    });

    const later = await checkStatus(filed.caseNumber, filed.pin, "web", caller);
    expect(later).toMatchObject({ ok: true, stage: "hearing", actions: { infoRequested: true, hearingScheduled: true, decisionIssued: true } });
    if (later.ok) expect(new Date(later.stageSince).getTime()).toBe(new Date(movedAt).getTime());
  });
});
