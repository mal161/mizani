/**
 * Seeds SYNTHETIC demo data into the configured Supabase project (never production):
 * 1 admin + 3 officers (Nairobi, Mombasa, Kisumu) with authenticator apps pre-enrolled,
 * and 25 cases across stages and categories, with notes, deadlines (some overdue) and info requests.
 *
 * Plus 2 advocates with portal accounts (sign in by phone), 6 notified cases and 3 responses (1 late).
 *
 * Plus (Plan 5) 2 commissioners with authenticator apps, 4 upcoming hearings (one online) and 3 heard cases with
 * decisions (a refund order, a tribunal referral and an admonishment).
 *
 * Usage: SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts [--advocates-only | --commission-only]
 * Prints demo logins (email, password, TOTP secret) once. Re-running skips existing demo accounts.
 * Redirect the output to a private file: it contains passwords and TOTP secrets.
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
const advocatesOnly = process.argv.includes("--advocates-only");
const commissionOnly = process.argv.includes("--commission-only");
const analyticsOnly = process.argv.includes("--analytics-only");
const { notifyAdvocateAs } = await import("../src/lib/advocates/notify");
const { submitAdvocateResponse } = await import("../src/lib/advocates/respond");
const { phoneEmail } = await import("../src/lib/auth/accounts");
type Role = "admin" | "staff" | "commissioner";
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
for (let i = 0; i < (advocatesOnly || commissionOnly || analyticsOnly ? 0 : 25); i++) {
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

// --- Advocate portal demo: two roll advocates with accounts, six notified cases, three responses. ---
const DEMO_ADVOCATES = [
  { admission: "P.105/DEMO1/2012", name: "Baraka Kiprono (Demo Advocate)", phone: "+254700009901", firm: "Haki & Co. Advocates" },
  { admission: "P.105/DEMO2/2015", name: "Leila Mutua (Demo Advocate)", phone: "+254700009902", firm: "Uadilifu LLP" },
];
const advocateLines: string[] = [];
let notified = 0;
for (const [k, a] of (commissionOnly || analyticsOnly ? [] : DEMO_ADVOCATES).entries()) {
  let { data: roll } = await admin.from("advocates").select("id,profile_id").eq("admission_no", a.admission).maybeSingle();
  if (!roll) {
    ({ data: roll } = await admin
      .from("advocates")
      .insert({ admission_no: a.admission, full_name: a.name, phone: a.phone, firm: a.firm })
      .select("id,profile_id")
      .single());
  }
  let profileId = roll!.profile_id as string | null;
  if (!profileId) {
    const created = await admin.auth.admin.createUser({ email: phoneEmail(a.phone), phone: a.phone, email_confirm: true, phone_confirm: true });
    profileId = created.data.user!.id;
    await admin.from("profiles").insert({ id: profileId, role: "advocate", phone: a.phone, full_name: a.name });
    await admin.from("advocates").update({ profile_id: profileId }).eq("id", roll!.id);
  }
  advocateLines.push(`advocate ${a.phone}  (${a.name}, ${a.admission}) — sign in at /login with this phone`);

  for (let j = 0; j < 3; j++) {
    const story = stories[(k * 3 + j) % stories.length];
    const officer = officers[(k + j) % officers.length];
    const complainantId = await ensureComplainantForPhone(`+2547000098${k}${j}`, story.lang, people[(k * 3 + j) % people.length]);
    const filed = await fileComplaint(
      { advocateId: roll!.id, advocateNameGiven: a.name, summary: story.summary, description: story.description, language: story.lang, consentDataProcessing: true },
      [new File([new TextEncoder().encode("%PDF-1.4 demo evidence")], "evidence.pdf", { type: "application/pdf" })],
      { complainantId, filedBy: complainantId, channel: "online", locale: story.lang, office: officer.office },
    );
    await assignCaseAs(officer, filed.caseId, officer.id);
    await changeStageAs(officer, filed.caseId, "received", "screening");
    const { data: docs } = await admin.from("documents").select("id").eq("case_id", filed.caseId);
    const servedOn = new Date(Date.now() - (j === 2 ? 20 : 3) * 86_400_000).toISOString().slice(0, 10);
    await notifyAdvocateAs(officer, filed.caseId, { servedOn, method: "hand", shareDocumentIds: (docs ?? []).map((d) => d.id) });
    notified++;
    if (k === 0 && j < 2) {
      await submitAdvocateResponse(profileId, filed.caseId, "I deny the allegations. The matter is being handled and the client was informed in writing on several occasions.", []);
    }
    if (k === 1 && j === 2) {
      await submitAdvocateResponse(profileId, filed.caseId, "Apologies for the delay. Attached is my account of the transaction and the fee note.", []);
    }
  }
}

console.log("Demo accounts (synthetic; dev project only):");
for (const a of accounts) console.log("  " + a);
console.log(`${created} cases created`);
for (const l of advocateLines) console.log("  " + l);
console.log(`${notified} advocates notified`);

// --- Commission demo (Plan 5): two commissioners, four upcoming hearings, three decisions. ---
const { scheduleHearingAs, recordHearingMinutesAs } = await import("../src/lib/commission/hearings");
const { recordDecisionAs } = await import("../src/lib/commission/decisions");
const COMMISSIONERS: (typeof STAFF)[number][] = [
  { email: "demo-commissioner1@mizani.demo", name: "Hon. Ruth Chebet (Demo Commissioner)", role: "commissioner", office: "Nairobi" },
  { email: "demo-commissioner2@mizani.demo", name: "Hon. Abdi Noor (Demo Commissioner)", role: "commissioner", office: "Nairobi" },
];
const commissionLines: string[] = [];
const comm: { id: string; role: "commissioner"; phone: null; office: string }[] = [];
for (const s of COMMISSIONERS) {
  const r = await ensureStaff(s);
  comm.push({ id: r.id, role: "commissioner", phone: null, office: s.office });
  commissionLines.push(r.created ? `commissioner ${s.email}  password: ${r.password}  TOTP secret: ${r.secret}` : `commissioner ${s.email}  (already existed — password unchanged)`);
}

const { count: seededDecisions } = await admin.from("decisions").select("id", { count: "exact", head: true }).like("reasons", "Demo decision:%");
let hearingsScheduled = 0;
let decisionsRecorded = 0;
if (!seededDecisions && !analyticsOnly) {
  const officer = officers[0];
  /** A fresh case moved to investigation, ready for a hearing. */
  const investigationCase = async (n: number) => {
    const story = stories[n % stories.length];
    const complainantId = await ensureComplainantForPhone(`+2547000097${String(n).padStart(2, "0")}`, story.lang, people[n % people.length]);
    const adv = advocates![n % advocates!.length];
    const filed = await fileComplaint(
      { advocateId: adv.id, advocateNameGiven: adv.full_name, summary: story.summary, description: story.description, language: story.lang, consentDataProcessing: true },
      [],
      { complainantId, filedBy: complainantId, channel: "online", locale: story.lang, office: officer.office },
    );
    await assignCaseAs(officer, filed.caseId, officer.id);
    await setCategoryPriorityAs(officer, filed.caseId, story.category, "high");
    for (let s = 0; s < 3; s++) await changeStageAs(officer, filed.caseId, path[s] as never, path[s + 1] as never);
    return filed.caseId;
  };
  /** 10:00 Nairobi, `days` from today. */
  const at = (days: number, hour = 10) => {
    const d = new Date(Date.now() + days * 86_400_000 + 3 * 3600_000).toISOString().slice(0, 10);
    return `${d}T${String(hour).padStart(2, "0")}:00:00+03:00`;
  };

  const upcoming = [
    { days: 2, panel: [comm[0].id], mode: "in_person" as const, venue: "ACC Boardroom, Nairobi" },
    { days: 5, panel: [comm[1].id], mode: "online" as const, onlineLink: "https://meet.example.org/acc-demo-hearing" },
    { days: 9, panel: [comm[0].id, comm[1].id], mode: "in_person" as const, venue: "ACC Mombasa Office, Hearing Room 1" },
    { days: 12, panel: [comm[0].id], mode: "in_person" as const, venue: "ACC Boardroom, Nairobi" },
  ];
  for (const [i, h] of upcoming.entries()) {
    const caseId = await investigationCase(i);
    await scheduleHearingAs(officer, caseId, { startsAt: at(h.days), durationMinutes: 60, mode: h.mode, venue: h.venue, onlineLink: h.onlineLink, panel: h.panel, confirmClash: true });
    hearingsScheduled++;
  }

  const decided = [
    { outcome: "refund_ordered" as const, amountKes: 65000, orders: "The advocate shall refund KES 65,000 to the complainant within 30 days and file proof of payment with the Commission." },
    { outcome: "referred_to_tribunal" as const, orders: "The complaint and record are referred to the Disciplinary Tribunal." },
    { outcome: "admonished" as const, orders: "The advocate is admonished and shall complete the conveyancing within 14 days." },
  ];
  for (const [i, d] of decided.entries()) {
    const caseId = await investigationCase(10 + i);
    const panel = i === 1 ? [comm[0].id, comm[1].id] : [comm[i % 2].id];
    const { hearingId } = await scheduleHearingAs(officer, caseId, { startsAt: at(1, 9 + i), durationMinutes: 60, mode: "in_person", venue: "ACC Boardroom, Nairobi", panel, confirmClash: true });
    // Synthetic history: the hearing took place last week.
    await admin.from("hearings").update({ starts_at: at(-7 + i, 10) }).eq("id", hearingId);
    const chair = comm.find((c) => c.id === panel[0])!;
    await recordHearingMinutesAs(chair, hearingId, "Demo minutes: both parties attended and made submissions. The advocate did not dispute receiving the client's money.");
    await recordDecisionAs(chair, caseId, {
      outcome: d.outcome,
      amountKes: d.amountKes,
      orders: d.orders,
      panel,
      reasons: "Demo decision: having heard both parties and reviewed the documents, the Commission finds that the advocate failed to account for client money and to keep the client informed, contrary to the Advocates Act.",
    });
    decisionsRecorded++;
  }
}
for (const l of commissionLines) console.log("  " + l);
if (!analyticsOnly) {
  console.log(seededDecisions ? "commission demo already seeded — skipped" : `${hearingsScheduled} hearings scheduled`);
  if (!seededDecisions) console.log(`${decisionsRecorded} decisions recorded`);
}

// --- Analytics history (Plan 6): 160 synthetic cases over the past 12 months, inserted with backdated timestamps.
// Services stamp now(), so this writes rows directly. Deterministic (seeded PRNG); skipped if already present.
if (analyticsOnly) {
  const { count: historyCount } = await admin.from("cases").select("id", { count: "exact", head: true }).like("summary", "[History] %");
  if (historyCount) {
    console.log("analytics history already seeded");
  } else {
    let seed = 20261128;
    const rand = () => {
      // mulberry32
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const DAY = 86_400_000;
    const now = Date.now();

    const complainants: string[] = [];
    for (let k = 0; k < 12; k++) {
      const story = stories[k % stories.length];
      complainants.push(await ensureComplainantForPhone(`+2547000096${String(k).padStart(2, "0")}`, story.lang, people[k % people.length]));
    }
    // Two advocates with repeated complaints (roll entries only; their portal accounts come from the advocates demo).
    const repeat: { id: string; full_name: string }[] = [];
    for (const a of DEMO_ADVOCATES) {
      let { data: roll } = await admin.from("advocates").select("id,full_name").eq("admission_no", a.admission).maybeSingle();
      if (!roll) ({ data: roll } = await admin.from("advocates").insert({ admission_no: a.admission, full_name: a.name, phone: a.phone, firm: a.firm }).select("id,full_name").single());
      repeat.push(roll!);
    }
    const others = (advocates ?? []).filter((a) => !repeat.some((r) => r.id === a.id));
    const offices = ["Nairobi", "Nairobi", "Nairobi", "Mombasa", "Kisumu"] as const;
    const officerFor = (office: string) => officers.find((o) => o.office === office) ?? officers[0];
    const categories = ["withheld_funds", "negligence", "overcharging", "conflict_of_interest", "delay", "misconduct"] as const;
    const SLA: Record<string, number> = { received: 3, screening: 7, advocate_notified: 14, investigation: 30, conciliation: 21, hearing: 14, decision: 14 };
    const outcomes = [
      ["dismissed", 25],
      ["settled", 15],
      ["withdrawn", 10],
      ["admonished", 20],
      ["refund_ordered", 20],
      ["referred_to_tribunal", 10],
    ] as const;
    const pickOutcome = () => {
      let r = rand() * 100;
      for (const [o, w] of outcomes) if ((r -= w) < 0) return o;
      return "dismissed" as const;
    };

    let historyCreated = 0;
    let historyDecisions = 0;
    for (let i = 0; i < 160; i++) {
      const created = now - between(5, 360) * DAY;
      const recent = now - created < 120 * DAY;
      const category = recent && rand() < 0.35 ? "withheld_funds" : pick(categories);
      const story = stories.find((s) => s.category === category) ?? pick(stories);
      const office = pick(offices);
      const officer = officerFor(office);
      const adv = i < 7 ? repeat[0] : i < 12 ? repeat[1] : pick(others);

      // Walk the lifecycle until "now"; some cases stall or are closed at screening.
      const moves: { from: string; to: string; at: number }[] = [];
      let stage = "received";
      let t = created;
      const step = (to: string, days: number) => {
        const next = t + days * DAY;
        if (next > now || rand() < 0.05) return false;
        moves.push({ from: stage, to, at: next });
        stage = to;
        t = next;
        return true;
      };
      let ok = step("screening", between(0.5, 4));
      if (ok && rand() < 0.1) {
        step("closed", between(2, 9));
      } else if (ok) {
        ok = step("advocate_notified", between(2, 9)) && step("investigation", between(8, 18));
        if (ok && rand() < 0.25) ok = step("conciliation", between(10, 35));
        ok = ok && step("hearing", between(10, 45)) && step("decision", between(5, 18));
        if (ok) step("closed", between(3, 12));
      }

      const { data: num } = await admin.rpc("next_case_number");
      const { data: c, error } = await admin
        .from("cases")
        .insert({
          case_number: num,
          complainant_id: complainants[i % complainants.length],
          filed_by: complainants[i % complainants.length],
          advocate_id: adv?.id ?? null,
          advocate_name_given: adv?.full_name ?? "Unlisted Advocate",
          category,
          stage,
          priority: pick(["low", "normal", "normal", "high", "urgent"] as const),
          summary: `[History] ${story.summary}`,
          description: story.description,
          language: story.lang,
          channel: rand() < 0.25 ? "walk_in" : "online",
          pin_hash: "history-no-pin",
          assigned_officer_id: officer.id,
          office,
          created_at: new Date(created).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`history case: ${error.message}`);

      if (moves.length) {
        await admin.from("case_events").insert(
          moves.map((m) => ({
            case_id: c.id,
            type: "stage_changed",
            visibility: "parties",
            actor_id: officer.id,
            body: { from: m.from, to: m.to },
            created_at: new Date(m.at).toISOString(),
          })),
        );
      }
      // Stage deadlines: entered + SLA, met when the case left the stage.
      const stays = [{ stage: "received", at: created }, ...moves.map((m) => ({ stage: m.to, at: m.at }))];
      const deadlines = stays
        .filter((s) => s.stage !== "closed" && SLA[s.stage])
        .map((s, k) => ({
          case_id: c.id,
          kind: "stage",
          stage: s.stage,
          due_at: new Date(s.at + SLA[s.stage] * DAY).toISOString(),
          met_at: stays[k + 1] ? new Date(stays[k + 1].at).toISOString() : null,
          created_at: new Date(s.at).toISOString(),
        }));
      if (deadlines.length) await admin.from("case_deadlines").insert(deadlines);

      const decidedAt = moves.find((m) => m.to === "decision")?.at;
      if (decidedAt) {
        const outcome = pickOutcome();
        await admin.from("decisions").insert({
          case_id: c.id,
          outcome,
          amount_kes: outcome === "refund_ordered" ? Math.round(between(20, 300)) * 1000 : null,
          reasons: "Demo history: the panel considered the complaint, the advocate's response and the documents on file before deciding.",
          panel: [comm[i % comm.length].id],
          decided_by: comm[i % comm.length].id,
          decided_at: new Date(decidedAt).toISOString(),
        });
        historyDecisions++;
      }
      historyCreated++;
    }
    console.log(`${historyCreated} history cases created`);
    console.log(`${historyDecisions} decisions recorded`);
  }
}
