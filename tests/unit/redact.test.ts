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

  describe("review fixes: formats that used to slip through", () => {
    it.each([
      ["Call 0712 34 56 78", "Call [PHONE]"],
      ["Call 712345678 today", "Call [PHONE] today"],
      ["Call (0712) 345678", "Call [PHONE]"],
      ["Call 0712.345.678", "Call [PHONE]"],
    ])("phone %s", (input, expected) => {
      expect(redact(input, none).text).toBe(expected);
    });

    it.each([
      ["My ID12345678 card", "My ID[ID_NUMBER] card"],
      ["ID No. 1234 5678 issued", "ID No. [ID_NUMBER] issued"],
      ["id number: 2345-6789.", "id number: [ID_NUMBER]."],
    ])("ID %s", (input, expected) => {
      expect(redact(input, none).text).toBe(expected);
    });

    it("removes bracketed email obfuscation", () => {
      expect(redact("write jane [at] gmail [dot] com or jo(at)mail.co.ke", none).text).toBe("write [EMAIL] or [EMAIL]");
    });

    it("removes the parties' known phone numbers and emails in any layout", () => {
      const r = redact("reach me on 0 7 1 2 - 3 4 5 - 6 7 8 or Mail: Zawadi.M@Example.com", none, {
        phones: ["+254712345678"],
        emails: ["zawadi.m@example.com"],
      });
      expect(r.text).toBe("reach me on [PHONE] or Mail: [EMAIL]");
    });

    it("matches names written with or without apostrophes, and hyphenated parts", () => {
      const parties = [{ name: "Wanjiku-Mwangi Ng'ang'a", placeholder: "[ADVOCATE]" }];
      expect(redact("Advocate Nganga said no", parties).text).toBe("Advocate [ADVOCATE] said no");
      expect(redact("Advocate Ng’ang’a said no", parties).text).toBe("Advocate [ADVOCATE] said no");
      expect(redact("Wanjiku came", parties).text).toBe("[ADVOCATE] came");
    });

    it("does not turn common words or firm suffixes into placeholders", () => {
      const r = redact("Kamau and Associates sent the letter and the fee note.", [
        { name: "Kamau and Associates Advocates", placeholder: "[ADVOCATE]" },
      ]);
      expect(r.text).toBe("[ADVOCATE] sent the letter and the fee note.");
    });
  });

  it("handles empty input", () => {
    const r = redact("", none);
    expect(r.text).toBe("");
    expect(Object.values(r.counts).every((n) => n === 0)).toBe(true);
  });
});
