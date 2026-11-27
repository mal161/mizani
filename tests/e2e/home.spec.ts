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

test("each story illustration sits on a ripple that is decorative, animated, and still for reduced motion", async ({ page }) => {
  await page.goto("/en");
  const ripples = page.locator('section[aria-labelledby="story"] [data-ripple]');
  await expect(ripples).toHaveCount(5);
  await expect(ripples.first()).toHaveAttribute("aria-hidden", "true");
  const water = ripples.first().locator(".ripple-water");
  expect(await water.evaluate((el) => getComputedStyle(el).animationName)).toBe("ripple-flow");
  // The rings must not widen the page on phones.
  await page.setViewportSize({ width: 390, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await page.locator("[data-ripple] .ripple-water").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("the placeholder text bars in the illustrations shimmer, and stay still for reduced motion", async ({ page }) => {
  await page.goto("/en");
  const bars = page.locator('section[aria-labelledby="story"] [data-skeleton] > span');
  expect(await bars.count()).toBeGreaterThan(10);
  expect(await bars.first().evaluate((el) => getComputedStyle(el, "::after").animationName)).toBe("shimmer");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await page.locator("[data-skeleton] > span").first().evaluate((el) => getComputedStyle(el, "::after").animationName)).toBe("none");
});

test("blocks below the fold fade in as they scroll into view; on-screen and reduced-motion content is shown at once", async ({ page }) => {
  const opacity = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).opacity));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  const last = '[data-reveal="story-decision"]';
  await expect(page.locator("[data-reveal]")).not.toHaveCount(0);
  // Already on screen at load: shown, never hidden.
  expect(await opacity('[data-reveal="services"]')).toBe(1);
  // Far below the fold: waiting to be revealed.
  expect(await opacity(last)).toBe(0);
  await page.locator(last).scrollIntoViewIfNeeded();
  await expect.poll(() => opacity(last), { timeout: 5000 }).toBe(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await opacity(last)).toBe(1);
});

test("/sw shows the Swahili title", async ({ page }) => {
  await page.goto("/sw");
  await expect(page.getByRole("banner")).toContainText("Tume ya Malalamiko dhidi ya Mawakili");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lalamika kuhusu wakili");
});
