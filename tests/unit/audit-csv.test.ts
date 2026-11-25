import { describe, it, expect } from "vitest";
import { toCsv, filtersFrom } from "@/lib/admin/audit-query";

const row = (over: Partial<Parameters<typeof toCsv>[0][number]> = {}) => ({
  id: 1,
  at: "2026-11-26T10:00:00Z",
  actor_id: null,
  actor_channel: "web",
  action: "view",
  entity: "cases",
  entity_id: "abc",
  details: {},
  ...over,
});

describe("audit CSV export", () => {
  it("quotes every cell and escapes quotes", () => {
    const csv = toCsv([row({ details: { note: 'He said "pay"' } })]);
    expect(csv.split("\r\n")[1]).toContain('"{""note"":""He said \\""pay\\""""}"');
  });

  it("neutralises spreadsheet formulas", () => {
    const csv = toCsv([row({ action: "=HYPERLINK(\"http://evil\")" })]);
    expect(csv).toContain(`"'=HYPERLINK`);
  });

  it("drops malformed date filters", () => {
    expect(filtersFrom({ from: "2026-11-01", to: "yesterday" })).toMatchObject({ from: "2026-11-01", to: undefined });
  });
});
