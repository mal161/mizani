import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsNewComplainant } from "./helpers";

async function fileQuickComplaint(page: Page, summary: string) {
  await page.goto("/en/my/file");
  await page.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await page.getByLabel("Summary of complaint").fill(summary);
  await page.getByLabel("What happened").fill("The advocate took my deposit and stopped answering my calls for months.");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: "Submit complaint" }).click();
  return (await page.getByTestId("case-number").textContent())!;
}

test("complainant sees own case in list and detail; another complainant gets 404; views are audited", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await loginAsNewComplainant(a, "en");
  const summary = `Deposit withheld ${Date.now()}`;
  const caseNumber = await fileQuickComplaint(a, summary);
  const slug = caseNumber.replaceAll("/", "-");

  await a.goto("/en/my/cases");
  await expect(a.getByRole("link", { name: new RegExp(caseNumber) })).toBeVisible();
  await a.getByRole("link", { name: new RegExp(caseNumber) }).click();
  await expect(a).toHaveURL(new RegExp(`/en/my/cases/${slug}$`));
  await expect(a.getByRole("heading", { level: 1 })).toContainText(caseNumber);
  await expect(a.getByText(summary)).toBeVisible();
  await expect(a.getByTestId("stage")).toHaveText("Received");
  await expect(a.getByRole("list", { name: "Timeline" }).getByText("Complaint filed")).toBeVisible();

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: c } = await admin.from("cases").select("id").eq("case_number", caseNumber).single();
  const { data: views } = await admin.from("audit_log").select("id").eq("entity_id", c!.id).eq("action", "view");
  expect(views!.length).toBeGreaterThanOrEqual(1);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await loginAsNewComplainant(b, "en");
  const res = await b.goto(`/en/my/cases/${slug}`);
  expect(res!.status()).toBe(404);
  await expect(b.getByText(summary)).toHaveCount(0);
});
