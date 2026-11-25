import { expect, type Page } from "@playwright/test";
import { authenticator } from "otplib";
import { signInStaff, STAFF_TEST_PASSWORD } from "../helpers/db";

/** Creates a fresh staff user with TOTP and signs them in through the UI (password + code). */
export async function loginAsStaff(
  page: Page,
  role: "staff" | "admin" | "commissioner" = "staff",
  locale: "en" | "sw" = "en",
  office = "Nairobi",
) {
  const user = await signInStaff(role, `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.mizani.local`, office);
  await page.goto(`/${locale}/staff/login`);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(STAFF_TEST_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff/mfa$`));
  await page.locator('input[name="code"]').fill(authenticator.generate(user.totpSecret));
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff$`));
  return user;
}

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
