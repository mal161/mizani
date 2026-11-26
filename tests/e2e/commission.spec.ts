import { test, expect } from "@playwright/test";
import { adminClient, makeCase, signInAs } from "../helpers/db";
import { loginAsStaff } from "./helpers";

const REASONS =
  "The advocate received KES 40,000 for a land transfer that never happened and did not account for the money despite repeated requests.";

test("commissioner hears a case, records minutes and a refund decision; officers cannot open the portal", async ({ browser }) => {
  test.setTimeout(240_000);
  const db = adminClient();

  // Commissioner signs in (TOTP) and lands on the commission portal
  const cCtx = await browser.newContext();
  const cp = await cCtx.newPage();
  const comm = await loginAsStaff(cp, "commissioner");
  await expect(cp).toHaveURL(/\/en\/commission$/);

  // A case at the hearing stage with a hearing tomorrow on this commissioner's panel
  const phone = `+2547${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const { userId } = await signInAs("complainant", phone);
  const c = await makeCase(userId, { stage: "hearing", summary: `Commission e2e ${Date.now()}` });
  const startsAt = new Date(Date.now() + 26 * 3600_000).toISOString();
  const { error } = await db
    .from("hearings")
    .insert({ case_id: c.id, starts_at: startsAt, mode: "in_person", venue: "ACC Boardroom, Nairobi", panel: [comm.userId] });
  expect(error).toBeNull();

  await cp.reload();
  const upcoming = cp.getByTestId("upcoming-hearings");
  await expect(upcoming.getByRole("link", { name: c.case_number })).toBeVisible();
  await upcoming.getByRole("link", { name: c.case_number }).click();
  // First visit compiles the route in dev; allow for it.
  await expect(cp).toHaveURL(new RegExp(`/en/commission/cases/${c.case_number.replaceAll("/", "-")}$`), { timeout: 90_000 });
  await expect(cp.getByText("ACC Boardroom, Nairobi")).toBeVisible();

  // Bundle download
  const [bundle] = await Promise.all([cp.waitForEvent("download"), cp.getByRole("link", { name: "Download case bundle" }).click()]);
  expect(bundle.suggestedFilename()).toMatch(/^bundle-.*\.pdf$/);

  // Minutes
  await cp.getByLabel("Hearing minutes").fill("Both parties attended. The advocate conceded receipt of the money.");
  await cp.getByRole("button", { name: "Save minutes" }).click();
  await expect(cp.getByRole("article").getByText("Both parties attended. The advocate conceded receipt of the money.")).toBeVisible();

  // Decision: refund of KES 40,000
  await cp.getByLabel("Outcome").selectOption("refund_ordered");
  await cp.getByLabel("Amount (KES)").fill("40000");
  await cp.getByLabel("Reasons").fill(REASONS);
  await cp.getByLabel("Orders").fill("Refund within 30 days.");
  await cp.getByRole("button", { name: "Record decision" }).click();
  await expect(cp.getByTestId("decision-outcome")).toHaveText("Refund ordered");
  await expect(cp.getByTestId("stage")).toHaveText("Decision");

  const [letter] = await Promise.all([cp.waitForEvent("download"), cp.getByRole("link", { name: "Download decision letter" }).click()]);
  expect(letter.suggestedFilename()).toMatch(/^decision-.*\.pdf$/);

  const { data: d } = await db.from("decisions").select("outcome,amount_kes,decided_by").eq("case_id", c.id).single();
  expect(d).toMatchObject({ outcome: "refund_ordered", amount_kes: 40000, decided_by: comm.userId });
  const { data: audit } = await db.from("audit_log").select("action").eq("entity_id", c.id).eq("actor_id", comm.userId);
  expect(audit!.map((a) => a.action)).toEqual(expect.arrayContaining(["view", "download_bundle", "record_minutes", "record_decision", "download_decision"]));

  // An officer is refused
  const oCtx = await browser.newContext();
  const op = await oCtx.newPage();
  await loginAsStaff(op, "staff");
  const res = await op.goto("/en/commission");
  expect(res?.status()).toBe(403);
});
