import { test, expect } from "@playwright/test";
import { loginAsStaff } from "./helpers";

test("officer files a walk-in complaint in Swahili and gets a printable slip; reload hides the PIN", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsStaff(page, "staff", "sw", "Kisumu");
  await page.goto("/sw/staff/intake");
  await page.getByLabel("Jina kamili la mlalamikaji").fill("Bwana Otieno");
  await page.getByLabel("Jina la wakili").fill("Wakili Asiyeorodheshwa");
  await page.getByLabel("Muhtasari wa lalamiko").fill("Wakili hajarudisha hati yangu ya shamba");
  await page.getByLabel("Eleza kilichotokea").fill("Nilimpa wakili hati ya shamba mwaka jana na hajairudisha hadi leo licha ya maombi.");
  await page.getByLabel(/Mlalamikaji amekubali/).check();
  await page.getByRole("button", { name: "Sajili lalamiko" }).click();

  await expect(page.getByRole("heading", { name: "Risiti ya lalamiko" })).toBeVisible();
  await expect(page.getByTestId("slip-case-number")).toHaveText(/^ACC\/\d{4}\/\d{6}$/);
  await expect(page.getByTestId("slip-pin")).toHaveText(/^\d{6}$/);
  await expect(page.getByText("Kisumu")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("slip-pin")).toHaveCount(0);
});
