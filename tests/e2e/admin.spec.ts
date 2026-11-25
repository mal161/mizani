import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsStaff } from "./helpers";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("admin creates an officer, routes withheld-funds cases to them, and sees it in the audit log", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsStaff(page, "admin");
  const name = `Officer E2E ${Date.now()}`;

  await page.goto("/en/staff/admin/users");
  await page.getByLabel("Email", { exact: true }).fill(`${name.replace(/\s/g, "-").toLowerCase()}@test.mizani.local`);
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  await page.getByLabel("Office", { exact: true }).fill("Nakuru");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("temp-password")).toHaveText(/^[\w-]{12,}$/);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();

  await page.goto("/en/staff/admin/routing");
  await page.getByLabel("Category", { exact: true }).selectOption("withheld_funds");
  await page.getByLabel(`${name} (Nakuru)`).check();
  await page.getByRole("button", { name: "Add rule" }).click();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();

  const { data: officer } = await db().from("profiles").select("id").eq("full_name", name).single();
  const { data: rules } = await db().from("routing_rules").select("id,category").contains("officer_ids", [officer!.id]);
  expect(rules).toEqual([{ id: expect.any(String), category: "withheld_funds" }]);

  await page.goto("/en/staff/admin/audit?action=admin_save_routing_rule");
  await expect(page.getByRole("cell", { name: "admin_save_routing_rule" }).first()).toBeVisible();

  // Clean up the rule so other tests' routing is unaffected.
  await page.goto("/en/staff/admin/routing");
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
});

test("an officer cannot open administration pages", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsStaff(page, "staff");
  const res = await page.goto("/en/staff/admin/users");
  expect(res!.status()).toBe(403);
});
