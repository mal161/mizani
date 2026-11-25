/**
 * Seeds SYNTHETIC demo data into the configured Supabase project (never production):
 * 1 admin + 3 officers (Nairobi, Mombasa, Kisumu) with authenticator apps pre-enrolled,
 * and 25 cases across stages and categories, with notes, deadlines (some overdue) and info requests.
 *
 * Usage: SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts
 * Prints demo logins (email, password, TOTP secret) once. Re-running skips existing demo accounts.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* rely on environment */
}
process.env.SMS_PROVIDER = "fake";

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fileComplaint } = await import("../src/lib/cases/file-complaint");
const { afterFiling } = await import("../src/lib/cases/after-filing");
const { changeStageAs, addNoteAs, setCategoryPriorityAs, requestInfoAs, assignCaseAs } = await import("../src/lib/cases/actions");
const { ensureComplainantForPhone } = await import("../src/lib/auth/accounts");

const admin = createAdminClient();
type Role = "admin" | "staff";
const STAFF: { email: string; name: string; role: Role; office: string }[] = [
  { email: "demo-admin@mizani.demo", name: "Wanjiru Kamau (Demo Admin)", role: "admin", office: "Nairobi" },
  { email: "demo-nairobi@mizani.demo", name: "Otieno Ochieng (Demo Officer)", role: "staff", office: "Nairobi" },
  { email: "demo-mombasa@mizani.demo", name: "Halima Said (Demo Officer)", role: "staff", office: "Mombasa" },
  { email: "demo-kisumu@mizani.demo", name: "Achieng Atieno (Demo Officer)", role: "staff", office: "Kisumu" },
];

async function ensureStaff(s: (typeof STAFF)[number]) {
  const { data: existing } = await admin.rpc("auth_user_id_by_email", { p_email: s.email });
  if (existing) return { id: existing as string, created: false as const };
  const password = randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email: s.email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${s.email}: ${error?.message}`);
  await admin.from("profiles").insert({ id: data.user.id, role: s.role, full_name: s.name, office: s.office });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email: s.email, password });
  const { data: f } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Demo" });
  await client.auth.mfa.challengeAndVerify({ factorId: f!.id, code: authenticator.generate(f!.totp.secret) });
  return { id: data.user.id, created: true as const, password, secret: f!.totp.secret };
}

const people = ["Amina Yusuf", "Peter Mwangi", "Grace Njeri", "Hassan Omar", "Mary Wambui", "Joseph Kiprop", "Fatuma Ali", "David Mutua"];
const stories: { summary: string; description: string; category: string; lang: "en" | "sw" }[] = [
  { summary: "Advocate withheld my compensation money", description: "I was awarded compensation after a road accident. The advocate received the money in March and has refused to pay me.", category: "withheld_funds", lang: "en" },
  { summary: "Wakili hajarudisha hati ya shamba", description: "Nilimpa wakili hati yangu ya shamba ili afanye uhamisho. Mwaka mmoja umepita na hajairudisha wala kufanya uhamisho.", category: "negligence", lang: "sw" },
  { summary: "Case dismissed because advocate missed hearings", description: "My employment case was dismissed for want of prosecution because my advocate did not attend three hearings.", category: "negligence", lang: "en" },
  { summary: "Advocate charged far above the agreed fee", description: "We agreed KES 80,000 for a land transfer. The advocate is now demanding KES 350,000 and holding my documents.", category: "overcharging", lang: "en" },
  { summary: "Advocate also acts for the other side", description: "I discovered that my advocate is also representing the company I am suing in a related matter.", category: "conflict_of_interest", lang: "en" },
  { summary: "Ucheleweshaji wa mirathi kwa miaka mitatu", description: "Wakili wetu amechelewesha mirathi ya marehemu baba yetu kwa miaka mitatu bila maelezo yoyote kwa familia.", category: "delay", lang: "sw" },
  { summary: "Advocate was rude and threatened me", description: "When I asked about my case progress the advocate shouted at me in the office and threatened to drop my case.", category: "misconduct", lang: "en" },
];
const path: string[] = ["received", "screening", "advocate_notified", "investigation", "hearing", "decision", "closed"];

const accounts = [];
const ids: Record<string, string> = {};
for (const s of STAFF) {
  const r = await ensureStaff(s);
  ids[s.email] = r.id;
  accounts.push(r.created ? `${s.role.padEnd(6)} ${s.email}  password: ${r.password}  TOTP secret: ${r.secret}` : `${s.role.padEnd(6)} ${s.email}  (already existed — password unchanged)`);
}
const officers = STAFF.filter((s) => s.role === "staff").map((s) => ({ id: ids[s.email], role: "staff" as const, phone: null, office: s.office }));

const { data: advocates } = await admin.from("advocates").select("id,full_name").limit(20);
let created = 0;
for (let i = 0; i < 25; i++) {
  const story = stories[i % stories.length];
  const officer = officers[i % officers.length];
  const phone = `+2547000090${String(i).padStart(2, "0")}`;
  const complainantId = await ensureComplainantForPhone(phone, story.lang, people[i % people.length]);
  const adv = advocates![i % advocates!.length];
  const filed = await fileComplaint(
    { advocateId: adv.id, advocateNameGiven: adv.full_name, summary: story.summary, description: story.description, language: story.lang, consentDataProcessing: true },
    [],
    { complainantId, filedBy: complainantId, channel: i % 4 === 0 ? "walk_in" : "online", locale: story.lang, office: officer.office },
  );
  await afterFiling(filed.caseId);
  await assignCaseAs(officer, filed.caseId, officer.id);
  await setCategoryPriorityAs(officer, filed.caseId, story.category, (["normal", "high", "urgent", "low"] as const)[i % 4]);
  await addNoteAs(officer, filed.caseId, "Demo note: initial review done; documents requested from complainant.");
  const target = i % path.length;
  for (let s = 0; s < target; s++) {
    await changeStageAs(officer, filed.caseId, path[s] as never, path[s + 1] as never, path[s + 1] === "closed" ? "Demo: resolved after hearing" : undefined);
  }
  if (target === 3) await requestInfoAs(officer, filed.caseId, "Please send copies of any receipts or letters from the advocate.", 7);
  if (i % 5 === 0 && target < 6) {
    // Make some deadlines overdue so the Overdue queue and alerts have content.
    await admin.from("case_deadlines").update({ due_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("case_id", filed.caseId).is("met_at", null);
  }
  created++;
}

console.log("Demo accounts (synthetic; dev project only):");
for (const a of accounts) console.log("  " + a);
console.log(`${created} cases created`);
