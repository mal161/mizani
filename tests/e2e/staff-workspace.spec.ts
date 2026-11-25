import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAsNewComplainant, loginAsStaff } from "./helpers";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("staff works a case end to end; complainant sees the stage but never the note", async ({ browser }) => {
  test.setTimeout(240_000);
  // Complainant files with evidence
  const cCtx = await browser.newContext();
  const cp = await cCtx.newPage();
  await loginAsNewComplainant(cp, "en");
  await cp.goto("/en/my/file");
  const summary = `Staff workspace e2e ${Date.now()}`;
  await cp.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await cp.getByLabel("Summary of complaint").fill(summary);
  await cp.getByLabel("What happened").fill("The advocate kept my title deed and stopped responding to my letters.");
  await cp.getByLabel(/Evidence/).setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 letter") });
  await cp.getByLabel(/I consent/).check();
  await cp.getByRole("button", { name: "Submit complaint" }).click();
  const caseNumber = (await cp.getByTestId("case-number").textContent())!;
  const slug = caseNumber.replaceAll("/", "-");

  // Staff finds it under "All" via search and opens it
  const sCtx = await browser.newContext();
  const sp = await sCtx.newPage();
  const staff = await loginAsStaff(sp, "staff");
  await sp.goto(`/en/staff?tab=all&q=${encodeURIComponent(caseNumber)}`);
  await sp.getByRole("link", { name: caseNumber }).click();
  await expect(sp).toHaveURL(new RegExp(`/en/staff/cases/${slug}$`));
  await expect(sp.getByText(summary)).toBeVisible();

  // Note
  await sp.getByLabel("Internal note").fill("Phoned the firm; partner promised a reply by Friday.");
  await sp.getByRole("button", { name: "Add note" }).click();
  await expect(sp.getByText("Phoned the firm; partner promised a reply by Friday.")).toBeVisible();

  // Triage
  await sp.getByLabel("Category").selectOption("withheld_funds");
  await sp.getByLabel("Priority").selectOption("high");
  await sp.getByRole("button", { name: "Save triage" }).click();
  await expect(sp.getByTestId("case-category")).toHaveText("Withheld client funds");

  // Stage change
  await sp.getByLabel("Move to").selectOption("screening");
  await sp.getByRole("button", { name: "Change stage" }).click();
  await expect(sp.getByTestId("stage")).toHaveText("Screening");

  // Document download is audited
  const [download] = await Promise.all([sp.waitForEvent("download"), sp.getByRole("link", { name: "letter.pdf" }).click()]);
  expect(download.suggestedFilename()).toBe("letter.pdf");

  const db = admin();
  const { data: c } = await db.from("cases").select("id").eq("case_number", caseNumber).single();
  const { data: views } = await db.from("audit_log").select("action").eq("entity_id", c!.id).eq("actor_id", staff.userId);
  expect(views!.map((v) => v.action)).toContain("view");
  const { data: docs } = await db.from("documents").select("id").eq("case_id", c!.id);
  const { data: dl } = await db.from("audit_log").select("id").eq("entity_id", docs![0].id).eq("action", "download");
  expect(dl!.length).toBeGreaterThanOrEqual(1);

  // Complainant view
  await cp.goto(`/en/my/cases/${slug}`);
  await expect(cp.getByTestId("stage")).toHaveText("Screening");
  await expect(cp.getByText("Phoned the firm")).toHaveCount(0);
});

test("a stale stage change is refused with a reload message", async ({ browser }) => {
  test.setTimeout(240_000); // two staff logins + first-compile on the dev server
  const cCtx = await browser.newContext();
  const cp = await cCtx.newPage();
  await loginAsNewComplainant(cp, "en");
  await cp.goto("/en/my/file");
  await cp.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await cp.getByLabel("Summary of complaint").fill(`Stale change e2e ${Date.now()}`);
  await cp.getByLabel("What happened").fill("Testing that two officers cannot both move the same case.");
  await cp.getByLabel(/I consent/).check();
  await cp.getByRole("button", { name: "Submit complaint" }).click();
  const slug = (await cp.getByTestId("case-number").textContent())!.replaceAll("/", "-");

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await loginAsStaff(a, "staff");
  await loginAsStaff(b, "staff");
  await a.goto(`/en/staff/cases/${slug}`);
  await b.goto(`/en/staff/cases/${slug}`);
  await a.getByLabel("Move to").selectOption("screening");
  await a.getByRole("button", { name: "Change stage" }).click();
  await expect(a.getByTestId("stage")).toHaveText("Screening");
  await b.getByLabel("Move to").selectOption("screening");
  await b.getByRole("button", { name: "Change stage" }).click();
  await expect(b.getByRole("alert").filter({ hasText: "changed by someone else" })).toBeVisible();
});
