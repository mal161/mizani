# Plan 5 — Commissioner Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Officers schedule hearings and the parties are told; commissioners get their own portal with their hearing calendar, the cases waiting for a hearing or decision, a complete case bundle (one PDF with the complaint, the advocate's response, the history and the evidence itself), hearing minutes, and a decision form; a decision is published to both parties with reasons, and a referral to the Disciplinary Tribunal is recorded and tracked with its own referral pack.

**Architecture:** Builds on Plans 1–4 and the same patterns: commissioners are staff-type accounts (password + authenticator, `staff_role()` read access); writes go through role-checked `*As(actor, …)` services; party-facing results are timeline events (`visibility 'parties'`, `advocate_visible true`) and SMS; staff-only material stays in staff-only tables. PDFs (bundle, decision letter, referral pack) are built server-side with `pdf-lib`, merging the original PDF evidence and embedding image evidence.

**Tech Stack:** as Plans 1–4 (Next.js 15, Supabase, pdf-lib, next-intl, Vitest, Playwright, Roboto).

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md` (§3 commissioner portal, §6 lifecycle: hearing → decision → closed, "Referred to Disciplinary Tribunal" as a decision outcome)

## Global Constraints

- All Plan 1–4 constraints hold (strict TS, en/sw parity, no client write grants, role-checked services, every change audited with the actor, demo data only, Roboto UI, no co-author trailers).
- Roles: **officers/admins** schedule, reschedule, adjourn and cancel hearings and close cases; **commissioners** record hearing minutes and decisions; admins can do both (small offices). Complainants and advocates read only what the timeline gives them.
- Decision outcomes (fixed list): `dismissed`, `withdrawn`, `settled` (resolved by agreement), `admonished`, `refund_ordered` (amount in KES required), `referred_to_tribunal`. Reasons (50–20000 chars) are published to both parties; `orders` (optional) too; `panel` = 1–5 commissioner ids.
- A decision can be recorded only at stage `hearing` (or `decision` to correct the last one, which supersedes it and is audited with before/after). Recording moves `hearing → decision`. Closing stays an officer action (`decision → closed`, reason required, Plan 2).
- Hearing notices go to both parties by SMS (complainant language; advocate in English) with date, time (Africa/Nairobi) and venue or "online"; links to online hearings are shown only in the portals, never in SMS.
- Hearing minutes are **internal** (staff and commissioners only).
- The case bundle never includes AI output; it includes internal notes and minutes and is marked "Confidential — for the Commission". Bundle and referral-pack downloads are audited (`download_bundle`, `download_referral`).
- Times are stored as `timestamptz`, entered and shown in Africa/Nairobi.

## Review Focus

1. An officer (not a commissioner) calls the decision action directly, or a commissioner calls schedule → refused, nothing written. (Task 2, Task 4.)
2. A complainant or advocate can see the hearing date/venue and the decision with reasons, but never the minutes, internal notes, the bundle, or the panel's private remarks. (Task 1, Task 4, Task 6.)
3. Two hearings for the same commissioner overlap → the second is refused unless explicitly confirmed; a case can't have two active (scheduled) hearings. (Task 2.)
4. The bundle with a corrupt/encrypted PDF or an unsupported image among the evidence → bundle still builds, with a placeholder page naming the file. (Task 3.)
5. Correcting a decision → the earlier one is marked superseded, the parties' timeline shows the corrected decision, audit has before/after. (Task 4.)

---

### Task 1: Schema and access

**Files:**
- Create: `supabase/migrations/20261129000001_hearings_decisions.sql`
- Test: `tests/db/rls-commission.test.ts`

**Interfaces:**
- `hearings(id uuid pk, case_id → cases on delete cascade, starts_at timestamptz, duration_minutes int default 60 check 15–480, mode text check in ('in_person','online'), venue text null, online_link text null, panel uuid[] not null, status text check in ('scheduled','held','adjourned','cancelled') default 'scheduled', minutes text null, created_by uuid, created_at, updated_at)`; unique partial index `(case_id) where status = 'scheduled'`.
- `decisions(id uuid pk, case_id → cases on delete cascade, outcome text check in (list), reasons text check 50–20000, orders text null, amount_kes numeric(14,2) null check (outcome <> 'refund_ordered' or amount_kes > 0), panel uuid[] not null, decided_by uuid, decided_at timestamptz default now(), superseded_by uuid null references decisions)`.
- `referrals(id uuid pk, case_id, decision_id → decisions, tribunal_reference text null, status text check in ('prepared','lodged','acknowledged','concluded') default 'prepared', updated_by uuid, created_at, updated_at)`.
- RLS on all three; `staff_role()` select; no client writes. Complainant/advocate get nothing from these tables (they see events).
- `notifications.kind` + `hearing_scheduled` (to panel members).

- [ ] **Step 1: Failing tests:** commissioner (aal2) selects hearings/decisions/referrals; officer selects them; complainant and advocate select nothing from all three; nobody can insert directly; second `scheduled` hearing for the same case violates the unique index (service-role insert).
- [ ] **Step 2–4:** FAIL → write + apply migration → PASS.
- [ ] **Step 5:** Commit `feat(db): hearings, decisions and referrals`.

### Task 2: Hearing service

**Files:**
- Create: `src/lib/commission/hearings.ts`
- Modify: `src/lib/cases/messages.ts` (`hearingScheduled`, `hearingChanged` SMS en/sw ≤160 chars)
- Test: `tests/db/hearings.test.ts`

**Interfaces:**
- `scheduleHearingAs(actor, caseId, input: { startsAt: string /* ISO with offset */; durationMinutes: number; mode: "in_person"|"online"; venue?: string; onlineLink?: string; panel: string[]; confirmClash?: boolean }): Promise<{ hearingId: string; clashes: string[] }>` — staff/admin only; case stage `investigation`, `conciliation` or `hearing`; start in the future; panel 1–5 active commissioners (or admins); `venue` required in person, `onlineLink` (https) required online; overlapping scheduled hearings of any panel member → if not `confirmClash`, throws `HearingClashError(clashes: case numbers)`; moves stage to `hearing` via `changeStageAs` when not already; event `hearing_scheduled` (`parties`, `advocate_visible` if notified, body `{starts_at, mode, venue}` — link not in body); SMS to complainant and (if notified and roll phone) advocate; notification `hearing_scheduled` to panel; audited.
- `rescheduleHearingAs(actor, hearingId, same input)`, `cancelHearingAs(actor, hearingId, reason)`, `adjournHearingAs(actor, hearingId, reason)` — staff/admin; event `hearing_changed` (parties) + SMS; audited.
- `recordHearingMinutesAs(actor, hearingId, minutes: string)` — commissioner on the panel or admin; sets `minutes`, `status 'held'`; event `hearing_held` (`parties`, no minutes in body); audited.
- `hearingsForCommissioner(userId, from: Date, to: Date)` and `caseHearings(caseId)` readers.

- [ ] **Step 1: Failing tests:** officer schedules → hearing row, stage `hearing`, event body without link, two SMS (complainant + notified advocate), panel notified; commissioner scheduling → `ForbiddenError`; past date, empty panel, non-commissioner in panel, online without https link → errors; overlapping panel member → `HearingClashError` with the other case number, succeeds with `confirmClash`; second active hearing for the same case → error; reschedule moves time and texts parties; panel commissioner records minutes → `held`, minutes invisible to the complainant client; an officer recording minutes → `ForbiddenError`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(commission): hearing scheduling and minutes`.

### Task 3: Case bundle PDF

**Files:**
- Create: `src/lib/commission/bundle.ts`, `src/app/api/cases/[id]/bundle/route.ts`
- Test: `tests/db/bundle.test.ts`

**Interfaces:**
- `buildCaseBundle(caseId: string): Promise<Uint8Array>` — cover page (case number, parties' names, advocate admission number, stage, dates, "Confidential — for the Commission"), contents, complaint, advocate responses (with late flags), timeline (all events incl. internal notes, with author names and dates), hearing minutes, then each document as an exhibit: a separator page ("Exhibit N — file name — uploaded by — date") followed by the PDF's own pages (`copyPages`) or the image embedded (JPEG/PNG) on its own page; a document that can't be read (corrupt, encrypted, other type) gets a placeholder page saying so. Uses the Plan 4 text wrapper (move `Writer` + `pdfSafe` to `src/lib/pdf/writer.ts` and reuse it in the notice letter).
- `GET /api/cases/[id]/bundle` — any staff role (`assertStaff()`), audited `download_bundle`, `Content-Disposition: attachment; filename="bundle-<case>.pdf"`, `no-store`.

- [ ] **Step 1: Failing tests:** bundle of a case with a note, an advocate response, one text PDF and one PNG: extracted text contains the case number, the note text, the response text, "Exhibit 1", "Exhibit 2" and the PDF exhibit's own text; page count = front matter + 2 separators + PDF pages + 1 image page; adding a corrupt "PDF" still builds and contains "could not be included"; no AI output text appears even when `ai_outputs` has a summary.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(commission): case bundle PDF with evidence exhibits`.

### Task 4: Decisions, decision letter and referrals

**Files:**
- Create: `src/lib/commission/decisions.ts`, `src/lib/commission/decision-letter.ts`, `src/lib/commission/referrals.ts`, `src/app/api/decisions/[id]/letter/route.ts`, `src/app/api/referrals/[id]/pack/route.ts`
- Modify: `src/lib/cases/messages.ts` (`decisionIssued` SMS en/sw)
- Test: `tests/db/decisions.test.ts`, `tests/unit/decision-letter.test.ts`

**Interfaces:**
- `recordDecisionAs(actor, caseId, input: { outcome; reasons; orders?; amountKes?; panel: string[] }): Promise<{ decisionId: string; referralId: string | null }>` — commissioner (or admin); actor must be in `panel`; stage `hearing` → moves to `decision`; stage `decision` → supersedes the latest decision (sets `superseded_by`); event `decision_issued` (`parties`, `advocate_visible`, body `{decision_id, outcome, reasons, orders, amount_kes, decided_at, corrected?: true}`); SMS to both parties; `referred_to_tribunal` → creates a `referrals` row (`prepared`); audited (before/after on correction).
- `buildDecisionLetter(decisionId): Promise<Uint8Array>` — English + Kiswahili summary, outcome, reasons, orders, amount, panel names, date; `GET /api/decisions/[id]/letter` — staff roles, the case's complainant, or the notified advocate (checked like documents); audited `download_decision`.
- `updateReferralAs(actor, referralId, { status, tribunalReference? })` — staff/admin; audited; event `referral_updated` (internal).
- `buildReferralPack(referralId)` = decision letter + case bundle; `GET /api/referrals/[id]/pack` — staff roles; audited.

- [ ] **Step 1: Failing tests:** commissioner on the panel records `refund_ordered` with amount → stage `decision`, event visible to complainant and advocate with reasons and amount, two SMS, audit; `refund_ordered` without amount → error; reasons under 50 chars → error; officer → `ForbiddenError`; commissioner not in the panel → error; stage `investigation` → error; correction at stage `decision` supersedes the first (one active decision, audit before/after, event `corrected: true`); `referred_to_tribunal` creates a `prepared` referral; officer updates it to `lodged` with a reference; letter PDF text contains outcome, reasons, amount, both languages; the complainant can fetch the letter, another complainant gets 404.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(commission): decisions, decision letters and tribunal referrals`.

### Task 5: Commissioner portal UI

**Files:**
- Create: `src/app/[locale]/commission/(app)/{layout.tsx,page.tsx}`, `.../hearings/page.tsx`, `.../cases/[caseNumber]/{page.tsx,DecisionForm.tsx,MinutesForm.tsx,actions.ts}`, `src/components/commission/*`
- Modify: `src/lib/auth/staff.ts` (+ commissioners land on `/commission` after MFA; staff/admin keep `/staff`), `StaffNav` (admins get a link to `/commission`), messages en/sw (`commission.*`)
- Test: `tests/e2e/commission.spec.ts`

**Interfaces:**
- `/commission` (commissioners + admins, `requireStaff(locale, ["commissioner","admin"])`): "My upcoming hearings" (next 30 days), "Awaiting decision" (stage `hearing` with a `held` hearing and no decision), "Recently decided".
- `/commission/hearings`: week-by-week agenda of hearings (all panels; own highlighted), previous/next week.
- `/commission/cases/[caseNumber]`: read-only case summary, parties, advocate response(s), timeline, hearings with minutes; **Download case bundle**; minutes form (if on the panel); decision form (outcome select; amount field only for refund; reasons; orders; panel pre-filled from the hearing panel); after deciding: decision shown + **Download decision letter** (+ **Download referral pack** for tribunal referrals). Page view audited.

- [ ] **Step 1: Failing e2e:** officer schedules a hearing (via the Task 6 form or, until then, the service) with a commissioner on the panel; the commissioner signs in (TOTP) and lands on `/commission`, sees the hearing, opens the case, downloads the bundle (PDF), records minutes, records a `refund_ordered` decision of KES 40,000 with reasons, downloads the decision letter; an officer opening `/en/commission` gets 403.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(commission): commissioner portal`.

### Task 6: Staff and party views

**Files:**
- Create: `src/components/staff/HearingPanel.tsx`, `src/components/case/HearingAndDecision.tsx`
- Modify: staff case page + actions (schedule/reschedule/adjourn/cancel form with panel picker and clash confirmation, referral status/reference editor, download bundle/letter/pack links), complainant case page and advocate case page (next hearing card with date/time/venue or online link, decision card with outcome, reasons, orders, amount, letter download), `Timeline` (new event types), messages en/sw
- Test: extend `tests/e2e/commission.spec.ts`

**Interfaces:** UI only, through Task 2–4 services behind `assertStaff(["staff","admin"])` (schedule/referrals) — commissioners' actions live in Task 5.

- [ ] **Step 1: Failing e2e:** officer schedules an online hearing from the staff case page (gets the clash prompt when the commissioner is already booked, confirms); complainant's page shows the hearing time and the online link; after the commissioner's decision, complainant and advocate pages show outcome, reasons and amount and can download the letter, and neither shows the minutes; officer marks the referral `lodged` with a reference on a tribunal case.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: hearings and decisions for staff, complainants and advocates`.

### Task 7: Demo data and docs

**Files:**
- Modify: `scripts/seed-demo.mts` (`--commission-only`: 2 demo commissioners with TOTP; 4 hearings over the next fortnight incl. one online; 3 decisions incl. one refund and one tribunal referral), `README.md` (commission routes, roles, decisions/referrals), `docs/deploy.md` (hearing notices, decision letters, referral packs, retention note)

- [ ] **Step 1:** Run `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts --commission-only` → Expected: prints 2 commissioner logins (to the scratch file), "4 hearings scheduled", "3 decisions recorded".
- [ ] **Step 2:** Full suite `npm test && npm run test:e2e && npm run build` → all pass.
- [ ] **Step 3:** Commit `docs: commissioner portal setup and demo data`.

## Left out of this plan (explicit)

- Calendar invitations (iCal/email) and video-conference integration (the online link is typed in by staff).
- Appeals and a public register of decisions (publication rules are the ACC's call).
- Quorum rules and voting records within a panel (the decision is recorded as the panel's).
- The analytics dashboard for commissioners (Plan 6).
