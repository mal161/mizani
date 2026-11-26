import { describe, it, expect } from "vitest";
import { redact } from "@/lib/ai/redact";

const none: Parameters<typeof redact>[1] = [];

describe("redact", () => {
  it("removes emails", () => {
    const r = redact("Write to jane.doe+acc@example.co.ke please", none);
    expect(r.text).toBe("Write to [EMAIL] please");
    expect(r.counts.email).toBe(1);
  });

  it.each([
    ["Call 0712345678 now", "Call [PHONE] now"],
    ["Call 0712 345 678 now", "Call [PHONE] now"],
    ["Call +254 712 345 678 now", "Call [PHONE] now"],
    ["Call +254-712-345-678 now", "Call [PHONE] now"],
    ["Call 254712345678 now", "Call [PHONE] now"],
    ["Call 0112 345 678 now", "Call [PHONE] now"],
  ])("removes Kenyan phone %s", (input, expected) => {
    expect(redact(input, none).text).toBe(expected);
  });

  it("removes KRA PINs and national ID numbers", () => {
    const r = redact("My KRA PIN is A012345678Z and my ID number is 23456789.", none);
    expect(r.text).toBe("My KRA PIN is [KRA_PIN] and my ID number is [ID_NUMBER].");
    expect(r.counts).toMatchObject({ kra_pin: 1, national_id: 1 });
  });

  it("removes an ID number followed by punctuation", () => {
    expect(redact("ID number 23456789, phone", none).text).toBe("ID number [ID_NUMBER], phone");
    expect(redact("(ID 1234567).", none).text).toBe("(ID [ID_NUMBER]).");
  });

  it("removes passport numbers only near the word passport", () => {
    expect(redact("Passport no. AK1234567 was taken", none).text).toBe("Passport no. [PASSPORT] was taken");
    expect(redact("Plot AK1234567 in Nakuru", none).text).toBe("Plot AK1234567 in Nakuru");
  });

  it("keeps money amounts and years", () => {
    const text = "He took KES 50,000 and Ksh 1,250,000 in 2024 and 12345678 shillings? No: KES 12345678.";
    const r = redact(text, none);
    expect(r.text).toContain("KES 50,000");
    expect(r.text).toContain("Ksh 1,250,000");
    expect(r.text).toContain("in 2024");
    expect(r.text).toContain("KES 12345678");
  });

  it("replaces known party names, full and partial, whole words only", () => {
    const r = redact(
      "Wakili Baraka Kiprono alichukua pesa zangu, nipigie 0712 345 678. Kiprono alikataa. Barakaville ni mbali.",
      [{ name: "Baraka Kiprono", placeholder: "[ADVOCATE]" }],
    );
    expect(r.text).toBe("Wakili [ADVOCATE] alichukua pesa zangu, nipigie [PHONE]. [ADVOCATE] alikataa. Barakaville ni mbali.");
    expect(r.counts.party_name).toBe(2);
  });

  it("is case-insensitive for names and ignores short name parts", () => {
    const r = redact("AMINA YUSUF and amina came. Al was there.", [{ name: "Amina Yusuf Al", placeholder: "[COMPLAINANT]" }]);
    expect(r.text).toBe("[COMPLAINANT] and [COMPLAINANT] came. Al was there.");
  });

  it("handles empty input", () => {
    const r = redact("", none);
    expect(r.text).toBe("");
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });
});
