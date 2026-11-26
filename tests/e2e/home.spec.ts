import { test, expect } from "@playwright/test";

test("root redirects to /en", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Advocates Complaints Commission",
  );
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tume ya Malalamiko dhidi ya Mawakili",
  );
});
