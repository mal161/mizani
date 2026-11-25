import { test, expect } from "@playwright/test";
import { loginAsNewComplainant } from "./helpers";

test("anyone can check status with case number + PIN on the web and via the USSD endpoint", async ({ page, request }) => {
  await loginAsNewComplainant(page, "en");
  await page.goto("/en/my/file");
  await page.getByLabel("Advocate's name").fill("Unlisted Advocate");
  await page.getByLabel("Summary of complaint").fill("Status page end-to-end test");
  await page.getByLabel("What happened").fill("Checking that the public status page and USSD endpoint both work.");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: "Submit complaint" }).click();
  const caseNumber = (await page.getByTestId("case-number").textContent())!;
  const pin = (await page.getByTestId("case-pin").textContent())!;

  // Web, in Swahili, signed out
  await page.context().clearCookies();
  await page.goto("/sw/status");
  await page.getByLabel("Nambari ya kesi").fill(caseNumber);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Angalia hali" }).click();
  await expect(page.getByTestId("status-stage")).toHaveText("Imepokelewa");

  // USSD (Africa's Talking callback format)
  const digits = caseNumber.replace(/\D/g, "");
  const res = await request.post("/api/ussd", {
    form: { sessionId: "s1", serviceCode: "*384*1#", phoneNumber: "+254700000999", text: `1*${digits}*${pin}` },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const body = await res.text();
  expect(body).toMatch(/^END /);
  expect(body).toContain("Received");
});
