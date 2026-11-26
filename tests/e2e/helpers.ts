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
  // Commissioners land on their own portal; officers and admins on the staff workspace.
  const target = new RegExp(`/${locale}/${role === "commissioner" ? "commission" : "staff"}$`);
  await page.locator('input[name="code"]').fill(authenticator.generate(user.totpSecret));
  await page.locator('form button[type="submit"]').click();
  try {
    await expect(page).toHaveURL(target, { timeout: 20_000 });
  } catch {
    // The code may equal the one used at enrolment seconds earlier (same 30s window); retry with the next one.
    await page.waitForTimeout((authenticator.timeRemaining() + 1) * 1000);
    await page.locator('input[name="code"]').fill(authenticator.generate(user.totpSecret));
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(target);
  }
  return user;
}

export function randomPhone() {
  return `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

/** Phone sign-in (test OTP 123456) for an existing complainant or advocate; waits for the landing page. */
export async function loginByPhone(page: Page, phone: string, landing: RegExp, locale: "en" | "sw" = "en") {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('button[name="intent"]').click();
  await page.locator('input[name="code"]').fill("123456");
  await page.locator('button[name="intent"]').click();
  await expect(page).toHaveURL(landing);
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
