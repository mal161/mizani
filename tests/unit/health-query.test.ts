import { describe, it, expect, vi } from "vitest";

const selects: unknown[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (_cols: string, opts?: unknown) => {
        selects.push(opts);
        return { limit: async () => ({ error: null }) };
      },
    }),
  }),
}));

describe("GET /api/health database probe", () => {
  it("reads at most one row and never counts the cases table (the endpoint is unauthenticated)", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(selects).toEqual([undefined]);
  });
});
