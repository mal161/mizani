import { test, expect, type Page, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { extractPdfText } from "../../src/lib/ai/document-text";
import { loginAsNewComplainant, loginAsStaff, randomPhone } from "./helpers";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const today = () => new Date().toISOString().slice(0, 10);

async function rollAdvocate() {
  const n = String(Date.now()).slice(-6);
  const { data } = await db()
    .from("advocates")
    .insert({ admission_no: `P.105/E2E${n}/2018`, full_name: `Wakili Mfano ${n}`, phone: `+2547009${n}` })
    .select("id,admission_no,full_name")
    .single();
  return data as { id: string; admission_no: string; full_name: string };
}

async function fileCase(browser: Browser, phone: string) {
  const cp = await (await browser.newContext()).newPage();
  await loginAsNewComplainant(cp, "en", phone);
  await cp.goto("/en/my/file");
  await cp.getByLabel("Advocate's name").fill("Someone Unlisted");
  await cp.getByLabel("Summary of complaint").fill(`Advocate e2e ${Date.now()}`);
  await cp.getByLabel("What happened").fill("The advocate kept the sale proceeds of my plot and stopped answering calls.");
  await cp.getByLabel(/Evidence/).setInputFiles([
    { name: "sale-agreement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 sale") },
    { name: "medical-report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 medical") },
  ]);
  await cp.getByLabel(/I consent/).check();
  await cp.getByRole("button", { name: "Submit complaint" }).click();
  const caseNumber = (await cp.getByTestId("case-number").textContent())!;
  return { cp, caseNumber, slug: caseNumber.replaceAll("/", "-") };
}

async function activate(page: Page, admissionNo: string, code: string, phone: string) {
  await page.goto("/sw/advocate/activate");
  await page.getByLabel("Nambari ya usajili wa wakili").fill(admissionNo);
  await page.getByLabel("Nambari ya uanzishaji").fill(code);
  await page.getByLabel("Nambari ya simu").fill(phone);
  await page.getByRole("button", { name: "Endelea" }).click();
  await page.getByLabel("Nambari ya tarakimu 6").fill("123456");
  await page.getByRole("button", { name: "Kamilisha" }).click();
  await expect(page).toHaveURL(/\/sw\/advocate$/);
}

test("advocate activates from the notice letter, sees only what they should, and responds", async ({ browser }) => {
  test.setTimeout(400_000);
  const adv = await rollAdvocate();
  const complainantPhone = randomPhone();
  const { cp, caseNumber, slug } = await fileCase(browser, complainantPhone);
  const { data: c } = await db().from("cases").select("id").eq("case_number", caseNumber).single();
  const { data: docs } = await db().from("documents").select("id,file_name").eq("case_id", c!.id);
  const share = docs!.find((d) => d.file_name === "sale-agreement.pdf")!.id;

  // Officer: link the roll advocate, add an internal note, move to screening, notify (via the notice endpoint).
  const sp = await (await browser.newContext()).newPage();
  await loginAsStaff(sp, "staff");
  await db().from("cases").update({ advocate_id: adv.id }).eq("id", c!.id);
  await sp.goto(`/en/staff/cases/${slug}`);
  await sp.getByLabel("Internal note").fill("Secret officer note: complainant may be exaggerating.");
  await sp.getByRole("button", { name: "Add note" }).click();
  await expect(sp.getByText("Secret officer note")).toBeVisible();
  await sp.getByLabel("Move to").selectOption("screening");
  await sp.getByRole("button", { name: "Change stage" }).click();
  await expect(sp.getByTestId("stage")).toHaveText("Screening");
  const res = await sp.request.post(`/api/cases/${c!.id}/notice`, {
    data: { servedOn: today(), method: "hand", shareDocumentIds: [share] },
  });
  expect(res.status()).toBe(200);
  const letter = (await extractPdfText(new Uint8Array(await res.body()), 100_000))!;
  const code = /activation code: ([A-Z2-9]{8})/.exec(letter)![1];

  // Advocate: activate in Swahili, open the case.
  const ap = await (await browser.newContext()).newPage();
  const advPhone = randomPhone();
  await activate(ap, adv.admission_no, code, advPhone);
  await ap.getByRole("link", { name: caseNumber }).click();
  await expect(ap).toHaveURL(new RegExp(`/sw/advocate/cases/${slug}$`));
  await expect(ap.getByText("The advocate kept the sale proceeds")).toBeVisible();
  const html = await ap.content();
  expect(html).not.toContain(complainantPhone.slice(1));
  expect(html).not.toContain("Secret officer note");
  await expect(ap.getByRole("link", { name: "sale-agreement.pdf" })).toBeVisible();
  await expect(ap.getByRole("link", { name: "medical-report.pdf" })).toHaveCount(0);

  // Respond with a document.
  await ap.getByLabel("Jibu lako").fill("Ninakanusha madai haya. Pesa zilitolewa tarehe 2 Aprili kama risiti inavyoonyesha.");
  await ap.getByLabel(/Ambatisha nyaraka/).setInputFiles({ name: "risiti.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 r") });
  await ap.getByRole("button", { name: "Tuma jibu" }).click();
  await expect(ap.getByText("Jibu lako limetumwa")).toBeVisible();

  // Staff sees the text; the complainant sees only that a response arrived.
  const { data: resp } = await db().from("advocate_responses").select("text").eq("case_id", c!.id);
  expect(resp![0].text).toContain("Ninakanusha");
  await cp.goto(`/en/my/cases/${slug}`);
  await expect(cp.getByRole("list", { name: "Timeline" }).getByText("Advocate responded")).toBeVisible();
  expect(await cp.content()).not.toContain("Ninakanusha");

  // Another advocate cannot open this case.
  const other = await rollAdvocate();
  const otherCase = await db().from("cases").insert({
    case_number: `ACC/2099/${String(Date.now()).slice(-6)}`,
    complainant_id: (await db().from("cases").select("complainant_id").eq("id", c!.id).single()).data!.complainant_id,
    filed_by: (await db().from("cases").select("complainant_id").eq("id", c!.id).single()).data!.complainant_id,
    advocate_id: other.id,
    advocate_name_given: other.full_name,
    summary: "x",
    description: "x".repeat(40),
    language: "en",
    channel: "online",
    pin_hash: "x",
    advocate_notified_at: new Date().toISOString(),
  }).select("case_number").single();
  const r = await ap.goto(`/sw/advocate/cases/${otherCase.data!.case_number.replaceAll("/", "-")}`);
  expect(r!.status()).toBe(404);
});
