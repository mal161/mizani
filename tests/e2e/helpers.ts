import { expect, type Page } from "@playwright/test";

export function randomPhone() {
  return `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

/** Signs in as a fresh complainant (test OTP 123456) and returns the phone used. */
export async function loginAsNewComplainant(page: Page, locale: "en" | "sw" = "en", phone = randomPhone()) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('button[name="intent"]').click();
  await page.locator('input[name="code"]').fill("123456");
  await page.locator('button[name="intent"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/my/cases$`));
  return phone;
}
