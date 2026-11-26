import { describe, it, expect } from "vitest";
import { parsePeriod, periodQuery } from "@/lib/analytics/period";

const now = new Date("2026-11-28T09:00:00Z"); // 12:00 in Nairobi

describe("parsePeriod", () => {
  it("defaults to the last 90 days ending tonight in Nairobi", () => {
    const p = parsePeriod({}, now);
    expect(p).toMatchObject({ key: "90d", fromDay: "2026-08-31", toDay: "2026-11-28" });
    expect(p.to.toISOString()).toBe("2026-11-28T21:00:00.000Z");
    expect(p.from.toISOString()).toBe("2026-08-30T21:00:00.000Z");
  });

  it("supports 30 and 365 day presets", () => {
    expect(parsePeriod({ period: "30d" }, now).fromDay).toBe("2026-10-30");
    expect(parsePeriod({ period: "365d" }, now).fromDay).toBe("2025-11-29");
  });

  it("takes a custom inclusive range in Nairobi days", () => {
    const p = parsePeriod({ period: "custom", from: "2026-01-01", to: "2026-01-31" }, now);
    expect(p).toMatchObject({ key: "custom", fromDay: "2026-01-01", toDay: "2026-01-31" });
    expect(p.from.toISOString()).toBe("2025-12-31T21:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-01-31T21:00:00.000Z");
    expect(parsePeriod({ period: "custom", from: "2026-03-05", to: "2026-03-05" }, now).key).toBe("custom");
  });

  it.each([
    [{ period: "custom", from: "2026-02-01", to: "2026-01-01" }],
    [{ period: "custom", from: "2026-13-45", to: "2026-12-01" }],
    [{ period: "custom", from: "2026-02-30", to: "2026-03-01" }],
    [{ period: "custom", from: "2020-01-01", to: "2026-01-01" }],
    [{ period: "custom" }],
    [{ period: "7y" }],
  ])("falls back to the default for %j", (q) => {
    expect(parsePeriod(q, now).key).toBe("90d");
  });
});

describe("periodQuery", () => {
  it("round-trips presets and custom ranges", () => {
    expect(periodQuery(parsePeriod({ period: "30d" }, now))).toBe("period=30d");
    expect(periodQuery(parsePeriod({ period: "custom", from: "2026-01-01", to: "2026-01-31" }, now))).toBe("period=custom&from=2026-01-01&to=2026-01-31");
  });
});
