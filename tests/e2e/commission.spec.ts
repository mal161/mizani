import { test, expect } from "@playwright/test";
import { adminClient, createPhoneAccount, makeCase, signInAs } from "../helpers/db";
import { loginAsStaff, loginByPhone } from "./helpers";

const digits = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
const MINUTES = "Private minutes: the advocate admitted keeping the deposit in the firm's office account.";

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

test("officer schedules an online hearing past a clash; parties see the hearing and decision but never the minutes; referral is tracked", async ({ browser }) => {
  test.setTimeout(600_000);
  const db = adminClient();

  // Commissioner (UI sign-in so their portal session is ready later)
  const mCtx = await browser.newContext();
  const mp = await mCtx.newPage();
  const comm = await loginAsStaff(mp, "commissioner");

  // Parties and a case at investigation with the advocate notified
  const cDigits = digits();
  const aDigits = digits();
  // Accounts that sign in through the real phone + SMS-code flow
  const { userId: complainantId } = await createPhoneAccount("complainant", `+2547${cDigits}`);
  const adv = await createPhoneAccount("advocate", `+2547${aDigits}`);
  const c = await makeCase(complainantId, {
    stage: "investigation",
    advocate_id: adv.advocateId,
    advocate_notified_at: new Date().toISOString(),
    summary: `Hearing e2e ${Date.now()}`,
  });
  const slug = c.case_number.replaceAll("/", "-");

  // The commissioner is already booked at that time on another case
  const day = new Date(Date.now() + 3 * 86400_000 + 3 * 3600_000).toISOString().slice(0, 10);
  const other = await makeCase(complainantId, { stage: "hearing" });
  await db.from("hearings").insert({ case_id: other.id, starts_at: `${day}T10:00:00+03:00`, mode: "in_person", venue: "Room 2", panel: [comm.userId] });

  // Officer schedules an online hearing; the clash is flagged and confirmed
  const sCtx = await browser.newContext();
  const sp = await sCtx.newPage();
  await loginAsStaff(sp, "staff");
  await sp.goto(`/en/staff/cases/${slug}`);
  await sp.getByLabel("Date and time").fill(`${day}T10:30`);
  await sp.getByLabel("Format").selectOption("online");
  await sp.getByLabel("Online link").fill("https://meet.example.org/acc-hearing");
  await sp.locator(`input[name="panel"][value="${comm.userId}"]`).check();
  await sp.getByRole("button", { name: "Schedule hearing" }).click();
  await expect(sp.getByTestId("clash-alert")).toContainText(other.case_number);
  await sp.getByRole("button", { name: "Schedule anyway" }).click();
  await expect(sp.getByTestId("scheduled-hearing")).toContainText("https://meet.example.org/acc-hearing");
  await expect(sp.getByTestId("stage")).toHaveText("Hearing");

  // Complainant sees the hearing time and the link
  const cCtx = await browser.newContext();
  const cp = await cCtx.newPage();
  await loginByPhone(cp, `07${cDigits}`, /\/en\/my\/cases$/);
  await cp.goto(`/en/my/cases/${slug}`);
  await expect(cp.getByTestId("next-hearing")).toContainText("https://meet.example.org/acc-hearing");
  await expect(cp.getByTestId("next-hearing")).toContainText("10:30");

  // Commissioner records minutes and a refund decision
  await mp.goto(`/en/commission/cases/${slug}`);
  await mp.getByLabel("Hearing minutes").fill(MINUTES);
  await mp.getByRole("button", { name: "Save minutes" }).click();
  await expect(mp.getByRole("article").getByText(MINUTES)).toBeVisible();
  await mp.getByLabel("Outcome").selectOption("refund_ordered");
  await mp.getByLabel("Amount (KES)").fill("40000");
  await mp.getByLabel("Reasons").fill(REASONS);
  await mp.getByRole("button", { name: "Record decision" }).click();
  await expect(mp.getByTestId("decision-outcome")).toHaveText("Refund ordered");

  // Complainant: outcome, reasons, amount, letter; no minutes
  await cp.reload();
  const card = cp.getByTestId("decision-card");
  await expect(card).toContainText("Refund ordered");
  await expect(card).toContainText("KES 40,000");
  await expect(card).toContainText(REASONS.slice(0, 40));
  const [letter] = await Promise.all([cp.waitForEvent("download"), card.getByRole("link", { name: "Download decision letter" }).click()]);
  expect(letter.suggestedFilename()).toMatch(/^decision-.*\.pdf$/);
  await expect(cp.getByText(MINUTES)).toHaveCount(0);

  // Commissioner corrects the decision to a tribunal referral
  await mp.reload();
  await mp.getByLabel("Outcome").selectOption("referred_to_tribunal");
  await mp.getByLabel("Reasons").fill(`${REASONS} The conduct is serious enough for the Disciplinary Tribunal.`);
  await mp.getByRole("button", { name: "Save correction" }).click();
  await expect(mp.getByTestId("decision-outcome")).toHaveText("Referred to the Disciplinary Tribunal");

  // Advocate sees the corrected decision and can download the letter; no minutes
  const aCtx = await browser.newContext();
  const ap = await aCtx.newPage();
  await loginByPhone(ap, `07${aDigits}`, /\/en\/advocate$/);
  await ap.goto(`/en/advocate/cases/${slug}`);
  const aCard = ap.getByTestId("decision-card");
  await expect(aCard).toContainText("Referred to the Disciplinary Tribunal");
  const [aLetter] = await Promise.all([ap.waitForEvent("download"), aCard.getByRole("link", { name: "Download decision letter" }).click()]);
  expect(aLetter.suggestedFilename()).toMatch(/^decision-.*\.pdf$/);
  await expect(ap.getByText(MINUTES)).toHaveCount(0);

  // Officer lodges the referral with the Tribunal
  await sp.reload();
  await sp.getByLabel("Referral status").selectOption("lodged");
  await sp.getByLabel("Tribunal reference").fill("DT/2026/0042");
  await sp.getByRole("button", { name: "Save referral" }).click();
  await expect(sp.getByTestId("referral")).toContainText("DT/2026/0042");
  const { data: ref } = await db.from("referrals").select("status,tribunal_reference").eq("case_id", c.id).single();
  expect(ref).toEqual({ status: "lodged", tribunal_reference: "DT/2026/0042" });
});
