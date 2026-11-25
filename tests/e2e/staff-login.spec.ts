import { test, expect } from "@playwright/test";
import { authenticator } from "otplib";
import { signInStaff, STAFF_TEST_PASSWORD } from "../helpers/db";
import { loginAsNewComplainant } from "./helpers";

test("staff signs in with password, then authenticator code", async ({ page }) => {
  const { email, totpSecret } = await signInStaff("staff", `e2e-officer-${Date.now()}@test.mizani.local`);

  await page.goto("/en/staff/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();

  await page.getByLabel("Password").fill(STAFF_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/staff\/mfa$/);

  // Not yet past MFA: the workspace bounces back to the MFA page.
  await page.goto("/en/staff");
  await expect(page).toHaveURL(/\/en\/staff\/mfa$/);

  await page.getByLabel("Authenticator code").fill(authenticator.generate(totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/en\/staff$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Workspace");
});

test("a complainant session cannot open the staff workspace", async ({ page }) => {
  await loginAsNewComplainant(page, "en");
  await page.goto("/en/staff");
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
});
