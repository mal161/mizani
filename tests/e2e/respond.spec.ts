import { test, expect } from "@playwright/test";
import { loginAsNewComplainant, loginAsStaff } from "./helpers";

test("staff requests information; complainant answers with a PDF; staff sees it", async ({ browser }) => {
  test.setTimeout(240_000);
  const cp = await (await browser.newContext()).newPage();
  await loginAsNewComplainant(cp, "en");
  await cp.goto("/en/my/file");
  await cp.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await cp.getByLabel("Summary of complaint").fill(`Info request e2e ${Date.now()}`);
  await cp.getByLabel("What happened").fill("The advocate took a deposit for a land search and never did it.");
  await cp.getByLabel(/I consent/).check();
  await cp.getByRole("button", { name: "Submit complaint" }).click();
  const slug = (await cp.getByTestId("case-number").textContent())!.replaceAll("/", "-");

  const sp = await (await browser.newContext()).newPage();
  await loginAsStaff(sp, "staff");
  await sp.goto(`/en/staff/cases/${slug}`);
  await sp.getByLabel("What do you need?").fill("Please upload the deposit receipt.");
  await sp.getByRole("button", { name: "Send request" }).click();
  await expect(sp.getByText("Please upload the deposit receipt.")).toBeVisible();

  await cp.goto(`/en/my/cases/${slug}`);
  await expect(cp.getByRole("heading", { name: "The Commission needs more information" })).toBeVisible();
  await expect(cp.getByText("Please upload the deposit receipt.").first()).toBeVisible();
  await cp.getByLabel("Your answer").fill("Receipt attached.");
  await cp.getByLabel(/Attach documents/).setInputFiles({ name: "deposit.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 r") });
  await cp.getByRole("button", { name: "Send answer" }).click();
  await expect(cp.getByText("Thank you. Your answer was sent.")).toBeVisible();

  await sp.reload();
  await expect(sp.getByRole("list", { name: "Timeline" }).getByText("Information provided")).toBeVisible();
  await expect(sp.getByRole("link", { name: "deposit.pdf" })).toBeVisible();
});
