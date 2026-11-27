import { describe, it, expect } from "vitest";
import { isNavActive } from "@/components/shell/nav-active";

describe("isNavActive", () => {
  const workspace = { href: "/staff", also: ["/staff/cases"] };
  it("marks Workspace on the list and on any case page, but not on other staff sections", () => {
    expect(isNavActive("/staff", workspace)).toBe(true);
    expect(isNavActive("/staff/cases/ACC-2026-000231", workspace)).toBe(true);
    expect(isNavActive("/staff/intake", workspace)).toBe(false);
    expect(isNavActive("/staff/casesxyz", workspace)).toBe(false);
  });

  it("keeps exact and prefix matching", () => {
    expect(isNavActive("/staff/admin/users", { href: "/staff/admin", prefix: true })).toBe(true);
    expect(isNavActive("/staff/admin/users", { href: "/staff/admin" })).toBe(false);
    expect(isNavActive("/commission/cases/ACC-2026-000001", { href: "/commission", also: ["/commission/cases"] })).toBe(true);
    expect(isNavActive("/commission/hearings", { href: "/commission", also: ["/commission/cases"] })).toBe(false);
  });
});
