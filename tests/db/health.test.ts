import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "@/app/api/health/route";

const req = (auth?: string) => new Request("http://localhost/api/health", { headers: auth ? { authorization: auth } : {} });
const secret = `health-test-${Date.now()}`;
let previous: string | undefined;

beforeAll(() => {
  previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;
});
afterAll(() => {
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
});

describe("GET /api/health", () => {
  it("tells anonymous callers only whether the service and database are up", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["db", "ok", "time"]);
    expect(body).toMatchObject({ ok: true, db: "ok" });
  });

  it("adds provider names and version for a caller with the CRON_SECRET bearer token, and never secrets", async () => {
    const wrong = await (await GET(req("Bearer not-the-secret"))).json();
    expect(wrong.sms).toBeUndefined();

    const body = await (await GET(req(`Bearer ${secret}`))).json();
    expect(body).toMatchObject({ ok: true, db: "ok" });
    expect(typeof body.sms).toBe("string");
    expect(typeof body.ai).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    const text = JSON.stringify(body);
    for (const s of [secret, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY]) {
      if (s) expect(text).not.toContain(s);
    }
  });
});
