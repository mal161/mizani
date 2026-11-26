import { test, expect } from "@playwright/test";
import { adminClient, makeCase, signInAs } from "../helpers/db";
import { loginAsStaff } from "./helpers";

const DAY = 86_400_000;

test("commissioner reads analytics, filters, exports; officers are refused", async ({ browser }) => {
  test.setTimeout(360_000);
  const db = adminClient();
  const stamp = Date.now();
  const office = `E2E-Analytics-${stamp}`;
  const at = (daysAgo: number) => new Date(stamp - daysAgo * DAY).toISOString();

  // Three cases in a fresh office: one closed after 12 days, one at investigation, one at decision with a refund order.
  const { userId } = await signInAs("complainant", "+254700004004");
  const closed = await makeCase(userId, { office, stage: "closed", created_at: at(100), category: "delay" });
  const open = await makeCase(userId, { office, stage: "investigation", created_at: at(60), category: "negligence" });
  const decided = await makeCase(userId, { office, stage: "decision", created_at: at(50), category: "withheld_funds" });
  await db.from("case_events").insert([
    { case_id: closed.id, type: "stage_changed", visibility: "parties", body: { from: "received", to: "closed" }, created_at: at(88) },
    { case_id: open.id, type: "stage_changed", visibility: "parties", body: { from: "received", to: "investigation" }, created_at: at(55) },
    { case_id: decided.id, type: "stage_changed", visibility: "parties", body: { from: "received", to: "decision" }, created_at: at(20) },
  ]);
  await db.from("decisions").insert({
    case_id: decided.id,
    outcome: "refund_ordered",
    amount_kes: 25000,
    reasons: "The advocate held the client's money without authority and must refund it in full.",
    panel: [userId],
    decided_at: at(20),
  });

  const cCtx = await browser.newContext();
  const cp = await cCtx.newPage();
  const comm = await loginAsStaff(cp, "commissioner");
  await cp.goto(`/en/commission/analytics?period=365d&office=${encodeURIComponent(office)}`);
  for (const h of ["Where cases wait", "Complaint trends", "Officer workload", "Advocates with repeated complaints", "Decision outcomes"]) {
    await expect(cp.getByRole("heading", { name: h })).toBeVisible({ timeout: 90_000 });
  }
  await expect(cp.getByTestId("stat-filed")).toContainText("3");
  await expect(cp.getByTestId("stat-refunds")).toContainText("25,000");

  // Filter: last 30 days, same office
  await cp.getByLabel("Period").selectOption("30d");
  await cp.getByRole("button", { name: "Apply" }).click();
  await expect(cp).toHaveURL(/period=30d/);
  await expect(cp).toHaveURL(new RegExp(`office=${office}`));

  // CSV export of the stage table
  await cp.goto(`/en/commission/analytics?period=365d&office=${encodeURIComponent(office)}`);
  const [csv] = await Promise.all([cp.waitForEvent("download"), cp.getByTestId("export-stages").click()]);
  expect(csv.suggestedFilename()).toMatch(/^mizani-stages-.*\.csv$/);
  const body = await (await import("node:fs/promises")).readFile((await csv.path())!, "utf8");
  expect(body.startsWith(`"# Mizani analytics: stages`)).toBe(true);
  const { data: exported } = await db.from("audit_log").select("id").eq("actor_id", comm.userId).eq("action", "export_analytics");
  expect(exported!.length).toBeGreaterThanOrEqual(1);

  // An office with no cases: every section says so
  await cp.goto(`/en/commission/analytics?period=365d&office=Nowhere-${stamp}`);
  await expect(cp.getByText("No data for this period.").first()).toBeVisible();
  expect(await cp.getByText("No data for this period.").count()).toBeGreaterThanOrEqual(5);

  // Officers are refused, page and export alike, and nothing is exported for them
  const oCtx = await browser.newContext();
  const op = await oCtx.newPage();
  const officer = await loginAsStaff(op, "staff");
  expect((await op.goto("/en/commission/analytics"))?.status()).toBe(403);
  expect((await op.request.get("/api/analytics/export?section=stages")).status()).toBe(403);
  const { data: none } = await db.from("audit_log").select("id").eq("actor_id", officer.userId).eq("action", "export_analytics");
  expect(none).toEqual([]);
});
