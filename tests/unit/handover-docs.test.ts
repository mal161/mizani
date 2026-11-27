import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const DOCS = ["README.md", "self-hosting.md", "operations.md", "data-protection.md", "security.md", "user-guide.md"].map((f) => path.join("docs/handover", f));
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("ACC handover pack", () => {
  it("has every document, none empty", () => {
    for (const d of [...DOCS, "Dockerfile", ".dockerignore"]) {
      expect(fs.existsSync(path.join(root, d)), d).toBe(true);
      expect(read(d).trim().length, d).toBeGreaterThan(200);
    }
  });

  it("has no broken relative links", () => {
    for (const d of [...DOCS, "README.md"]) {
      for (const m of read(d).matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:)/.test(target)) continue;
        expect(fs.existsSync(path.resolve(path.dirname(path.join(root, d)), target)), `${d} -> ${target}`).toBe(true);
      }
    }
  });

  it("documents every environment variable in .env.example", () => {
    const guide = read("docs/handover/self-hosting.md");
    const vars = [...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(5);
    for (const v of vars) expect(guide, v).toContain(v);
  });

  it("has Kiswahili guides for complainants and advocates", () => {
    const g = read("docs/handover/user-guide.md");
    expect(g).toContain("## Mlalamikaji");
    expect(g).toContain("## Wakili");
  });
});

describe("handover docs say only what the code does", () => {
  it("does not promise a one-time password or a recovery page the app lacks", () => {
    for (const d of ["docs/handover/operations.md", "docs/handover/self-hosting.md"]) {
      expect(read(d), d).not.toMatch(/one-time password|recovery link/i);
    }
    expect(read("docs/handover/security.md")).toMatch(/no in-app password change/i);
  });

  it("explains how to load the real advocates roll", () => {
    expect(read("docs/handover/self-hosting.md")).toMatch(/advocates roll/i);
  });

  it("does not claim consent is stored or that every analytics section has a CSV", () => {
    expect(read("docs/handover/data-protection.md")).not.toMatch(/records the complainant's consent/i);
    expect(read("README.md")).not.toMatch(/each section downloads as CSV/i);
    expect(read("docs/handover/user-guide.md")).not.toMatch(/each with CSV download/i);
    expect(read("docs/handover/operations.md")).not.toMatch(/app log for `sms_failed`/i);
  });
});
