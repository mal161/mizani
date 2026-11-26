import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+254700")).toBe(`"'+254700"`);
    expect(csvCell("@sum")).toBe(`"'@sum"`);
  });

  it("quotes commas, quotes and newlines; empties nulls", () => {
    expect(csvCell('Kamau, "Wakili"\nLLP')).toBe(`"Kamau, ""Wakili""\nLLP"`);
    expect(csvCell(null)).toBe(`""`);
    expect(csvCell(3.5)).toBe(`"3.5"`);
  });

  it("joins rows with CRLF and ends with one", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe(`"a","b"\r\n"1","x"\r\n`);
  });
});
