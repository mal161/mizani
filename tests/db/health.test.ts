import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports the database, providers and version without secrets", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: "ok" });
    expect(typeof body.sms).toBe("string");
    expect(typeof body.ai).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    const text = JSON.stringify(body);
    for (const secret of [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY]) {
      if (secret) expect(text).not.toContain(secret);
    }
  });
});
