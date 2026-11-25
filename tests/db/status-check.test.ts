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

const wrong = () => (pin === "000000" ? "111111" : "000000");

describe("checkStatus", () => {
  it("returns the stage for the right PIN and audits it", async () => {
    const r = await checkStatus(caseNumber, pin, "web");
    expect(r).toMatchObject({ ok: true, stage: "received" });
    const { data } = await adminClient()
      .from("audit_log")
      .select("actor_channel,details")
      .eq("entity_id", caseId)
      .eq("action", "status_check");
    expect(data!.some((d) => d.actor_channel === "web" && d.details.ok === true)).toBe(true);
  });

  it("unknown case and wrong PIN both return 'invalid'", async () => {
    expect(await checkStatus("ACC/1999/999999", "123456", "ussd")).toEqual({ ok: false, reason: "invalid" });
    expect(await checkStatus(caseNumber, wrong(), "ussd")).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks the case after 5 failures in an hour, even for the right PIN", async () => {
    // one failure already recorded above
    for (let i = 0; i < 4; i++) await checkStatus(caseNumber, wrong(), "ussd");
    expect(await checkStatus(caseNumber, wrong(), "ussd")).toEqual({ ok: false, reason: "locked" });
    expect(await checkStatus(caseNumber, pin, "ussd")).toEqual({ ok: false, reason: "locked" });
  });
});
