# Plan 4 — Advocate Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an officer formally notifies an advocate of a complaint, the advocate is texted and served a notice letter with an activation code, can claim an account on Mizani with that code, sees the allegations and the evidence the officer chose to share, and submits a response with documents before the response deadline — without ever seeing the complainant's contact details, internal notes, or unshared evidence.

**Architecture:** Builds on Plans 1–3. Advocates sign in exactly like complainants (phone + SMS code); the login resolves the phone to the right role and portal. They read through an `advocate_cases` view and advocate-specific RLS policies keyed on `advocates.profile_id = auth.uid()`; all writes go through server services after a role check, as before. The response text lives in its own table that complainants cannot read; the timeline only records that a response arrived.

**Tech Stack:** as Plans 1–3, plus `pdf-lib` (server-side notice letter).

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md` (§3 advocate portal, §11 "Notifying advocates without accounts" and "Advocate visibility")

## Global Constraints

- All Plan 1–3 constraints hold (strict TS, en/sw key parity, no client write grants, writes via role-checked services, every change audited with the actor, demo data only, no co-author trailers).
- An advocate sees a case **only after** an officer has notified them (`cases.advocate_notified_at` set) and only cases whose `advocate_id` is the roll entry linked to their profile.
- An advocate sees: case number, filing date, stage, the complaint summary and description, the complainant's **name** (never phone, email, or address fields), documents with `shared_with_advocate = true`, documents they uploaded, events with `advocate_visible = true`, their response deadline, and their own responses. Never internal notes, AI output, flags, other cases, or the PIN.
- A complainant sees that the advocate responded (timeline event), never the response text or the advocate's documents (those are `visibility = 'internal'`).
- Response deadline = date of service (set by staff) + `advocateResponseDays` (Plan 2 setting). Late responses are accepted and marked late.
- Activation codes: 8 characters from an unambiguous alphabet (no 0/O/1/I), bcrypt-hashed, valid 30 days, single use, 5 wrong attempts per code then locked; one active code per case (re-notifying replaces it).
- Sign-in for advocates = the existing phone + SMS code flow. The phone used at activation becomes the account's phone (must not belong to another account).
- The notice letter is generated on request for staff; it contains the activation code only at generation time right after notifying (code is never stored in clear).

## Review Focus

1. Advocate A requests advocate B's case page or document URL directly → 404, no data. (Task 1, Task 5.)
2. An advocate's page and API responses never contain the complainant's phone number, internal notes, unshared documents or AI output. (Task 1, Task 5.)
3. Brute-forcing activation codes → locked after 5 wrong tries per code; a used or expired code never works; activation with a phone that belongs to a complainant or staff account is refused. (Task 2.)
4. Someone signs in with a complainant's phone after an advocate activation attempt fails → still lands in the complainant portal with their own cases (no role confusion). (Task 2.)
5. Notifying twice → the earlier activation code stops working; one deadline open, not two. (Task 3.)

---

### Task 1: Schema and advocate read access

**Files:**
- Create: `supabase/migrations/20261128000001_advocate_portal.sql`
- Test: `tests/db/rls-advocate.test.ts`; helper `signInAdvocate(phone)` in `tests/helpers/db.ts` (creates a roll entry + advocate profile linked by `profile_id`)

**Interfaces:**
- `cases` + `advocate_notified_at timestamptz null`, `advocate_served_on date null`, `advocate_service_method text null check in ('email','sms','hand','post','courier')`.
- `case_events` + `advocate_visible boolean not null default false`.
- `documents` + `shared_with_advocate boolean not null default false`.
- `advocate_activations(id uuid pk, case_id → cases on delete cascade, advocate_id → advocates, code_hash text, attempts int default 0, expires_at timestamptz, used_at timestamptz null, created_by uuid, created_at)`; unique partial index on `case_id` where `used_at is null`; RLS on, no policies.
- `advocate_responses(id uuid pk, case_id → cases on delete cascade, advocate_profile_id → profiles, text text not null check (char_length(text) between 1 and 20000), late boolean not null, created_at)`; RLS: staff select via `staff_role()`; advocate select own rows.
- SQL `is_my_advocate_case(p_case_id uuid) returns boolean` (security definer): case's `advocate_id` → `advocates.profile_id = auth.uid()` and `advocate_notified_at is not null` and caller's profile is active `advocate`.
- View `advocate_cases` (owner rights, security_barrier): `id, case_number, created_at, stage, summary, description, advocate_served_on, complainant_name, response_due` (the open `advocate_response` deadline) filtered by `is_my_advocate_case(id)`.
- Policies (select, `authenticated`): `case_events` where `advocate_visible and is_my_advocate_case(case_id)`; `documents` where `is_my_advocate_case(case_id) and (shared_with_advocate or uploaded_by = auth.uid())`. No other new grants.

- [ ] **Step 1: Failing tests:** advocate A sees their notified case in `advocate_cases` with `complainant_name` and no phone column (selecting `complainant_phone` errors); A does not see the same case before `advocate_notified_at` is set; A does not see advocate B's case; A sees `advocate_visible` events only (not internal notes, not complainant-only events); A sees shared documents and own uploads, not unshared ones; A cannot read `ai_outputs`, `staff_cases`, `advocate_activations`; A reads own `advocate_responses` only; complainant cannot read `advocate_responses`; A cannot insert anywhere.
- [ ] **Step 2:** `npx vitest run tests/db/rls-advocate.test.ts` → FAIL. **Step 3:** write + apply migration. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(db): advocate portal schema and read access`.

### Task 2: Activation and role-aware phone sign-in

**Files:**
- Create: `src/lib/advocates/activation.ts`
- Modify: `src/lib/auth/accounts.ts` (+ `resolveAccountForPhone`), `src/lib/auth/otp.ts` (`verifyLoginCode` returns `role`), `src/app/[locale]/(public)/login/actions.ts` (redirect by role), `src/lib/auth/session.ts` (+ `requireAdvocate(locale)`)
- Test: `tests/db/advocate-activation.test.ts`, `tests/unit/activation-code.test.ts`

**Interfaces:**
- `generateActivationCode(): string` (8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, crypto-random); `normaliseActivationCode(input: string): string` (upper-case, strip spaces/dashes).
- `createActivation(caseId: string, advocateId: string, createdBy: string): Promise<string>` — returns the clear code once; replaces any unused code for the case (marks it used).
- `startAdvocateActivation(input: { admissionNo: string; code: string; phone: string }, locale): Promise<{ ok: true } | { ok: false; reason: "invalid" | "locked" | "phone_in_use" }>` — matches the roll entry by admission number, an unused unexpired activation for a case against that advocate, and the code (attempt counted atomically before comparing, like login codes); phone must be a valid Kenyan number not owned by a non-advocate profile (and not by another advocate); on success sends a normal login code to the phone and stores a pending activation (`advocate_activations` row keeps `pending_phone`, add column).
- `completeAdvocateActivation(phone: string, loginCode: string): Promise<VerifyResult>` — verifies the SMS code (Plan 1 `verifyLoginCode` machinery), creates/links the advocate profile (`role 'advocate'`, phone, `full_name` from the roll), sets `advocates.profile_id`, marks the activation used, audits `advocate_activated`.
- `resolveAccountForPhone(phone, locale)`: existing complainant → id; existing **active** advocate → id; staff/admin/commissioner → refuse; none → create complainant (Plan 1 behaviour).
- `verifyLoginCode` result gains `role: "complainant" | "advocate"`; login action redirects advocates to `/advocate`, complainants to `/my/cases`.
- `requireAdvocate(locale): Promise<CurrentUser & { advocateId: string }>` — redirect to `/login` otherwise.

- [ ] **Step 1: Failing tests:** code alphabet/length; normalisation (`"abcd-2345"` → `"ABCD2345"`); right admission no + code + fresh phone → SMS sent, completing with the SMS code creates an advocate profile linked to the roll entry; wrong code 5× → `locked` even with the right code next; used code → `invalid`; expired code → `invalid`; phone already a complainant's → `phone_in_use`; signing in later with the advocate's phone returns `role: "advocate"`; signing in with a complainant phone still returns `role: "complainant"` and the same profile id.
- [ ] **Step 2–4:** FAIL → implement (+ migration adding `pending_phone`) → PASS.
- [ ] **Step 5:** Commit `feat(advocates): activation codes and role-aware phone sign-in`.

### Task 3: Notify the advocate (staff service) and notice letter

**Files:**
- Create: `src/lib/advocates/notify.ts`, `src/lib/advocates/notice-letter.ts`, `src/app/api/cases/[id]/notice/route.ts`
- Modify: `src/lib/cases/messages.ts` (`advocateNotified` SMS en/sw ≤160 chars, no complainant details), `src/lib/cases/actions.ts` (`setDocumentSharedAs`, `linkAdvocateAs`)
- Test: `tests/db/advocate-notify.test.ts`, `tests/unit/notice-letter.test.ts`

**Interfaces:**
- `linkAdvocateAs(actor, caseId, advocateId): Promise<void>` — staff/admin; sets `cases.advocate_id` to a roll entry (when the complainant typed a name not matched at filing); event `advocate_linked` (internal); audited.
- `setDocumentSharedAs(actor, documentId, shared: boolean): Promise<void>` — staff/admin; only `parties` documents can be shared; audited.
- `notifyAdvocateAs(actor, caseId, input: { servedOn: string /* YYYY-MM-DD, not in the future */; method: "email"|"sms"|"hand"|"post"|"courier"; shareDocumentIds: string[] }): Promise<{ activationCode: string; responseDue: string }>` — staff/admin; case must have `advocate_id`; stage must be `screening` or `advocate_notified` (re-notification); sets `advocate_notified_at`, `advocate_served_on`, `advocate_service_method`; shares the listed documents; `createActivation`; closes any open `advocate_response` deadline and opens one at `servedOn + advocateResponseDays` (end of day, Africa/Nairobi); moves stage `screening → advocate_notified` via `changeStageAs` (which also texts the complainant); event `advocate_notified` (`visibility 'parties'`, `advocate_visible true`, body `{served_on, method, response_due}`); SMS `advocateNotified` to the roll phone if present; audited `notify_advocate`.
- `buildNoticeLetter(data: { caseNumber; advocateName; admissionNo; firm?; summary; description; servedOn; responseDue; activationCode; portalUrl; office }): Promise<Uint8Array>` — A4 PDF (pdf-lib, Helvetica), English with a Kiswahili paragraph, includes the allegations, deadline, how to respond, activation code and admission number to use, and the ACC office; never complainant contact details.
- `POST /api/cases/[id]/notice` — staff/admin (`assertStaff`), body `{servedOn, method, shareDocumentIds}` → runs `notifyAdvocateAs` and responds with the PDF (`Content-Disposition: attachment; filename="notice-<case>.pdf"`). This is the only time the clear code exists.

- [ ] **Step 1: Failing tests:** notifying a screening case: stage becomes `advocate_notified`, one open `advocate_response` deadline at served+14 days, chosen document shared and others not, complainant got the stage SMS, roll phone got the advocate SMS with the case number and no complainant name/phone, audit row with actor; re-notifying: old code no longer activates, still one open response deadline; case without `advocate_id` → error; `servedOn` in the future → error; complainant or commissioner actor → `ForbiddenError`; letter PDF parses (via `extractPdfText` from Plan 3) and contains case number, activation code, response date, and not the complainant's phone.
- [ ] **Step 2–4:** FAIL → `npm i pdf-lib`, implement → PASS.
- [ ] **Step 5:** Commit `feat(advocates): formal notification with notice letter`.

### Task 4: Advocate response service

**Files:**
- Create: `src/lib/advocates/respond.ts`
- Test: `tests/db/advocate-respond.test.ts`

**Interfaces:**
- `submitAdvocateResponse(userId: string, caseId: string, text: string, files: File[]): Promise<{ late: boolean }>` — caller must be the linked advocate of a notified case (same check as `is_my_advocate_case`, done in TS with the admin client); text 20–20000 chars; evidence via `validateEvidence` + `uploadEvidence(..., visibility 'internal')`; inserts `advocate_responses` (`late` = now after the open deadline's `due_at`); event `advocate_responded` (`visibility 'parties'`, `advocate_visible true`, body `{late, documents: n}` — no text); `meetDeadlines(caseId, 'advocate_response')`; notification `info_provided` kind reused? → add kind `advocate_responded` to the notifications check constraint and notify the assigned officer; audited `advocate_response`. Multiple responses allowed (supplementary); only the first meets the deadline.

- [ ] **Step 1: Failing tests:** on-time response stored with `late=false`, event visible to complainant without text, documents `internal` and uploaded_by the advocate, deadline met, officer notified; complainant client reads no `advocate_responses` row and no advocate documents; another advocate → error; case not yet notified → error; response after due date → `late=true`; text under 20 chars → validation error.
- [ ] **Step 2–4:** FAIL → implement (+ migration for the notification kind) → PASS.
- [ ] **Step 5:** Commit `feat(advocates): advocate response with documents`.

### Task 5: Advocate portal UI

**Files:**
- Create: `src/app/[locale]/advocate/activate/{page.tsx,ActivateForm.tsx,actions.ts}`, `src/app/[locale]/advocate/(app)/{layout.tsx,page.tsx}`, `src/app/[locale]/advocate/(app)/cases/[caseNumber]/{page.tsx,ResponseForm.tsx,actions.ts}`
- Modify: `src/app/[locale]/(public)/login/LoginForm.tsx` + home page (link "Advocate? Activate your account"), `src/app/api/documents/[id]/route.ts` (already RLS-based; add test), messages en/sw (`advocatePortal.*`)
- Test: `tests/e2e/advocate.spec.ts`

**Interfaces:**
- `/advocate/activate`: admission number + activation code + phone → SMS code → done → `/advocate`. Generic error for invalid code/admission; separate messages for `locked` and `phone_in_use`.
- `/advocate`: list of notified cases (case number, filed date, stage, response due with "overdue" styling, responded yes/no).
- `/advocate/cases/[caseNumber]`: allegations, complainant name, shared documents (download via `/api/documents/[id]`), advocate-visible timeline, deadline banner, response form (text + up to 5 files) and list of own past responses; page view audited `view`; 404 for anything not `is_my_advocate_case`.
- Header with sign-out; both languages.

- [ ] **Step 1: Failing e2e (fake SMS, OTP_TEST_CODE):** staff notifies an advocate on a filed case and downloads the notice (capture the activation code from the PDF text via `extractPdfText`); advocate activates in Swahili with the code and a fresh phone, lands on `/sw/advocate`, opens the case, sees the allegations and complainant name, does **not** see the complainant's phone or the staff internal note added earlier, downloads the shared document, submits a response with a PDF; staff case page shows the response text and file; complainant's case page shows "Advocate responded" but not the text; a second advocate visiting the first one's case URL gets 404.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(advocates): advocate portal`.

### Task 6: Staff UI for notification, sharing and responses

**Files:**
- Create: `src/components/staff/AdvocatePanel.tsx`
- Modify: staff case page + actions (link roll advocate via the existing advocate search, share toggles on documents, "Notify advocate" form: method, date served, documents to share → posts to `/api/cases/[id]/notice` and downloads the PDF; shows served date, response due, responses with late badge and files), messages en/sw
- Test: extend `tests/e2e/advocate.spec.ts` (link flow for an unmatched advocate name; share toggle)

**Interfaces:** UI only; uses Task 3/4 services through server actions guarded by `assertStaff(["staff","admin"])`. Commissioners see the panel read-only.

- [ ] **Step 1: Failing e2e:** staff links a case filed with an unmatched advocate name to a roll entry via search, toggles a document to shared, notifies, and the panel shows "Served <date> · response due <date>"; after the advocate responds the panel lists the response.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(staff): advocate notification and response panel`.

### Task 7: Demo data and docs

**Files:**
- Modify: `scripts/seed-demo.mts` (link 2 demo advocates to profiles with phones `+2547000099xx`, notify 6 of the demo cases, add 3 responses incl. 1 late), `README.md` (advocate routes, activation, visibility rules), `docs/deploy.md` (notice letter, service methods)

- [ ] **Step 1:** Run `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts` → Expected: prints advocate demo phones; "6 advocates notified".
- [ ] **Step 2:** Full suite `npm test && npm run test:e2e && npm run build` → all pass.
- [ ] **Step 3:** Commit `docs: advocate portal setup and demo data`.

## Left out of this plan (explicit)

- Email delivery of notices (no email provider is configured; letters are downloaded and served by hand/post/courier, SMS goes to the roll phone).
- Extension-of-time requests by advocates, and advocate access to the complainant's later information-request answers.
- Real Law Society of Kenya roll integration (the roll stays a seeded/imported table).
