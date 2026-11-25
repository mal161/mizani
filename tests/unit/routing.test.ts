import { describe, it, expect } from "vitest";
import { pickOfficer, type RoutingRule } from "@/lib/cases/routing";

const rule = (p: Partial<RoutingRule> & { officer_ids: string[] }): RoutingRule => ({
  id: crypto.randomUUID(),
  position: 0,
  category: null,
  priority: null,
  office: null,
  active: true,
  ...p,
});

const c = { category: "withheld_funds", priority: "high", office: "Nairobi" };
const counts = (o: Record<string, number>) => new Map(Object.entries(o));

describe("pickOfficer", () => {
  it("uses the first matching rule by position", () => {
    const rules = [
      rule({ position: 2, officer_ids: ["b"] }),
      rule({ position: 1, category: "withheld_funds", officer_ids: ["a"] }),
    ];
    expect(pickOfficer(c, rules, counts({}), ["a", "b", "z"])).toBe("a");
  });

  it("treats null rule fields as wildcards and non-null as filters", () => {
    const rules = [
      rule({ position: 1, category: "negligence", officer_ids: ["a"] }),
      rule({ position: 2, office: "Nairobi", priority: "high", officer_ids: ["b"] }),
    ];
    expect(pickOfficer(c, rules, counts({}), ["a", "b"])).toBe("b");
  });

  it("picks the least-loaded officer in the pool, ties by pool order", () => {
    const rules = [rule({ officer_ids: ["a", "b", "c"] })];
    expect(pickOfficer(c, rules, counts({ a: 5, b: 2, c: 2 }), ["a", "b", "c"])).toBe("b");
  });

  it("skips inactive rules", () => {
    const rules = [rule({ position: 1, active: false, officer_ids: ["a"] }), rule({ position: 2, officer_ids: ["b"] })];
    expect(pickOfficer(c, rules, counts({}), ["a", "b"])).toBe("b");
  });

  it("falls back to the least-loaded of all active staff when no rule matches", () => {
    const rules = [rule({ category: "delay", officer_ids: ["a"] })];
    expect(pickOfficer(c, rules, counts({ x: 3, y: 1 }), ["x", "y"])).toBe("y");
  });

  it("returns null when nobody is available", () => {
    expect(pickOfficer(c, [], counts({}), [])).toBeNull();
  });

  it("ignores officers in a rule pool who are no longer active staff", () => {
    const rules = [rule({ officer_ids: ["gone", "b"] })];
    expect(pickOfficer(c, rules, counts({ gone: 0, b: 9 }), ["b"])).toBe("b");
  });
});
