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

test("home tells a case's story in five illustrated steps", async ({ page }) => {
  await page.goto("/en");
  const story = page.getByRole("region", { name: "From complaint to decision" });
  const steps = story.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
  await expect(steps).toHaveCount(5);
  for (const label of ["Received", "Advocate notified", "Investigation", "Hearing", "Decision"]) {
    await expect(story).toContainText(label);
  }
  await expect(story.getByRole("img", { name: /hearing notice: Wednesday 9 December/ })).toBeVisible();
  await expect(story.getByRole("img", { name: /decision letter: refund ordered/ })).toBeVisible();

  await page.goto("/sw");
  await expect(page.getByRole("heading", { level: 2, name: "Kutoka lalamiko hadi uamuzi" })).toBeVisible();
  await expect(page.getByRole("img", { name: /ilani ya usikilizaji/ })).toBeVisible();
});

test("/sw shows the Swahili title", async ({ page }) => {
  await page.goto("/sw");
  await expect(page.getByRole("banner")).toContainText("Tume ya Malalamiko dhidi ya Mawakili");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lalamika kuhusu wakili");
});
