import { describe, it, expect } from "vitest";
import { normalizeKenyanPhone } from "@/lib/phone";
import { FakeSms } from "@/lib/sms/fake";
import { getSmsProvider } from "@/lib/sms";

describe("normalizeKenyanPhone", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["0112345678", "+254112345678"],
    [" 0712 345 678 ", "+254712345678"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeKenyanPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0812345678", "+255712345678", "07123456789", "abc"])(
    "rejects %s",
    (input) => {
      expect(normalizeKenyanPhone(input)).toBeNull();
    },
  );
});

describe("SMS provider", () => {
  it("fake provider records sent messages", async () => {
    const sms = new FakeSms();
    const res = await sms.send("+254712345678", "hello");
    expect(res.id).toBeTruthy();
    expect(sms.sent).toEqual([{ to: "+254712345678", message: "hello" }]);
  });

  it("getSmsProvider returns the fake when SMS_PROVIDER=fake", () => {
    process.env.SMS_PROVIDER = "fake";
    expect(getSmsProvider()).toBeInstanceOf(FakeSms);
  });
});
