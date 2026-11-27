import { test, expect, type Page } from "@playwright/test";
import { loginAsStaff } from "./helpers";

// A tiny valid PNG: the fake OCR provider does not look at the pixels.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

async function waitForOcrText(page: Page, url: string) {
  // OCR runs after the filing response (next/server `after`), so reload until its result is stored.
  await expect(async () => {
    await page.goto(url);
    await expect(page.getByText(/Text read from this scan \(OCR\) · confidence 90%/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

test("staff and commissioners see text read from a scanned walk-in document; only officers can re-read", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await loginAsStaff(page, "staff", "en", "Nairobi");
  await page.goto("/en/staff/intake");
  await page.getByLabel("Complainant's full name").fill("Grace Wanjiru");
  await page.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await page.getByLabel("Summary of complaint").fill("Advocate kept the sale money");
  await page.getByLabel("What happened").fill("I sold land through the advocate and the money was never paid to me after the sale.");
  await page.locator('input[name="evidence"]').setInputFiles({ name: "receipt-scan.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel(/consented/i).check();
  await page.getByRole("button", { name: "Register complaint" }).click();
  const caseNumber = (await page.getByTestId("slip-case-number").textContent())!.trim();
  const slug = caseNumber.replaceAll("/", "-");

  await waitForOcrText(page, `/en/staff/cases/${slug}`);
  await page.getByText(/Text read from this scan/).click();
  await expect(page.getByText("Scanned text of receipt-scan.png")).toBeVisible();
  await expect(page.getByText(/OCR can misread words/)).toBeVisible();

  const commissionerContext = await browser.newContext();
  const commissioner = await commissionerContext.newPage();
  await loginAsStaff(commissioner, "commissioner", "en");
  await commissioner.goto(`/en/commission/cases/${slug}`);
  await expect(commissioner.getByText(/Text read from this scan \(OCR\) · confidence 90%/)).toBeVisible();
  await expect(commissioner.getByRole("button", { name: "Read text again" })).toHaveCount(0);
  await commissionerContext.close();
});
