import { test, expect } from "@playwright/test";
import { loginAsNewComplainant } from "./helpers";

test("complainant files a complaint in Swahili with evidence and gets a case number and PIN", async ({ page }) => {
  await loginAsNewComplainant(page, "sw");
  await page.goto("/sw/my/file");

  await page.getByLabel("Jina la wakili").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Achieng/ }).click();
  await page.getByLabel("Muhtasari wa lalamiko").fill("Wakili amezuia pesa zangu za fidia");
  await page
    .getByLabel("Eleza kilichotokea")
    .fill("Nililipwa fidia mwezi Machi lakini wakili amekataa kunipa pesa hizo hadi sasa bila sababu.");
  await page.getByLabel(/Ushahidi/).setInputFiles({
    name: "risiti.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test receipt"),
  });
  await page.getByLabel(/Nakubali/).check();
  await page.getByRole("button", { name: "Wasilisha lalamiko" }).click();

  await expect(page.getByRole("heading", { name: "Lalamiko limepokelewa" })).toBeVisible();
  await expect(page.getByTestId("case-number")).toHaveText(/^ACC\/\d{4}\/\d{6}$/);
  await expect(page.getByTestId("case-pin")).toHaveText(/^\d{6}$/);
});

test("form shows translated errors and keeps what was typed", async ({ page }) => {
  await loginAsNewComplainant(page, "en");
  await page.goto("/en/my/file");
  await page.getByLabel("Advocate's name").fill("Some Advocate");
  await page.getByLabel("Summary of complaint").fill("Too short");
  await page.getByLabel("What happened").fill("Also short");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: "Submit complaint" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please fix" })).toBeVisible();
  await expect(page.getByLabel("Advocate's name")).toHaveValue("Some Advocate");
});
