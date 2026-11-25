import { test, expect } from "@playwright/test";

test("deadline cron endpoint rejects calls without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/deadlines")).status()).toBe(401);
  expect(
    (await request.get("/api/cron/deadlines", { headers: { Authorization: "Bearer wrong" } })).status(),
  ).toBe(401);
});
