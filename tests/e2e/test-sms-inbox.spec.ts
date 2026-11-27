import { test, expect } from "@playwright/test";
import { loginAsStaff, randomPhone } from "./helpers";

test("an admin reads a sign-in code in the test SMS inbox; officers cannot open it", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // Someone asks for a sign-in code; SMS is in test mode, so it lands in the inbox.
  const local = randomPhone(); // 07XXXXXXXX
  const intl = `+254${local.slice(1)}`;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/en/login");
  await visitor.getByLabel("Phone number").fill(local);
  await visitor.getByRole("button", { name: "Send code" }).click();
  await expect(visitor.getByLabel("6-digit code")).toBeVisible();

  const ap = await (await browser.newContext()).newPage();
  await loginAsStaff(ap, "admin");
  await ap.goto("/en/staff/admin");
  await ap.getByRole("link", { name: /Test SMS inbox/ }).click();
  await expect(
    ap.getByRole("heading", { level: 1, name: "Test SMS inbox" }),
  ).toBeVisible({ timeout: 90_000 });
  const row = ap.getByRole("row").filter({ hasText: intl });
  await expect(row).toContainText("Your Mizani login code");

  const op = await (await browser.newContext()).newPage();
  await loginAsStaff(op, "staff");
  expect((await op.goto("/en/staff/admin/sms-inbox"))?.status()).toBe(403);
});
