import { test, expect } from "@playwright/test";

export function randomPhone() {
  return `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

test("complainant logs in with phone + SMS code and lands on their cases", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(randomPhone());
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/my\/cases$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My cases");
});

test("wrong code shows an error in Swahili", async ({ page }) => {
  await page.goto("/sw/login");
  await page.getByLabel("Nambari ya simu").fill(randomPhone());
  await page.getByRole("button", { name: "Tuma nambari" }).click();
  await page.getByLabel("Nambari ya tarakimu 6").fill("999999");
  await page.getByRole("button", { name: "Ingia" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "si sahihi" })).toBeVisible();
});

test("signed-out visitor to /en/my/cases is sent to login", async ({ page }) => {
  await page.goto("/en/my/cases");
  await expect(page).toHaveURL(/\/en\/login/);
});
