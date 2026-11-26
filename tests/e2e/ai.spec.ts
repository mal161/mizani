import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsNewComplainant, loginAsStaff } from "./helpers";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("AI suggestion: shown labelled to staff, applied by a person, summary on demand, hidden from complainant, switchable", async ({ browser }) => {
  test.setTimeout(300_000);
  const cp = await (await browser.newContext()).newPage();
  await loginAsNewComplainant(cp, "en");
  await cp.goto("/en/my/file");
  await cp.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await cp.getByLabel("Summary of complaint").fill(`AI e2e ${Date.now()}`);
  await cp.getByLabel("What happened").fill("The advocate withheld funds owed to me, KES 40,000 from a land sale, for five months.");
  await cp.getByLabel(/I consent/).check();
  await cp.getByRole("button", { name: "Submit complaint" }).click();
  const slug = (await cp.getByTestId("case-number").textContent())!.replaceAll("/", "-");

  const sp = await (await browser.newContext()).newPage();
  await loginAsStaff(sp, "staff");
  await sp.goto(`/en/staff/cases/${slug}`);
  const panel = sp.getByRole("region", { name: "AI assistance" });
  await expect(panel.getByText("AI-generated suggestion")).toBeVisible();
  await expect(panel.getByTestId("ai-priority")).toHaveText("High");

  await panel.getByRole("button", { name: "Apply suggestion" }).click();
  await expect(sp.getByTestId("case-category")).toHaveText("Withheld client funds");
  await expect(sp.getByRole("list", { name: "Timeline" }).getByText("Category and priority set")).toBeVisible();

  await panel.getByRole("button", { name: "Summarize case file" }).click();
  await expect(panel.getByTestId("ai-summary")).toContainText("demo AI");

  await expect(sp.getByRole("region", { name: "Case flags" })).toBeVisible();

  await cp.goto(`/en/my/cases/${slug}`);
  await expect(cp.getByText("AI-generated")).toHaveCount(0);
  await expect(cp.getByText("demo AI")).toHaveCount(0);

  try {
    await db().from("settings").update({ value: false }).eq("key", "ai_enabled");
    await sp.reload();
    await expect(sp.getByRole("region", { name: "AI assistance" }).getByText("AI is switched off")).toBeVisible();
  } finally {
    await db().from("settings").update({ value: true }).eq("key", "ai_enabled");
  }
});

test("admin can switch AI assistance off and on in workflow settings", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsStaff(page, "admin");
  try {
    await page.goto("/en/staff/admin/settings");
    await page.getByLabel("Use AI assistance").uncheck();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
    const { data } = await db().from("settings").select("value").eq("key", "ai_enabled").single();
    expect(data!.value).toBe(false);
  } finally {
    await db().from("settings").update({ value: true }).eq("key", "ai_enabled");
  }
});
