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
