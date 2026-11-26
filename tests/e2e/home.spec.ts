import { test, expect } from "@playwright/test";

test("root redirects to /en", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("banner")).toContainText("Advocates Complaints Commission");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Complain about an advocate");
});

test("pages use Roboto, and Roboto Mono for case numbers", async ({ page }) => {
  await page.goto("/en");
  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(body).toMatch(/Roboto/);
  const mono = await page.evaluate(() => {
    const el = document.createElement("span");
    el.className = "font-mono";
    document.body.appendChild(el);
    return getComputedStyle(el).fontFamily;
  });
  expect(mono).toMatch(/Roboto Mono/);
});

test("/sw shows the Swahili title", async ({ page }) => {
  await page.goto("/sw");
  await expect(page.getByRole("banner")).toContainText("Tume ya Malalamiko dhidi ya Mawakili");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lalamika kuhusu wakili");
});
