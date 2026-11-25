# Plan 2 — Staff Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ACC staff can sign in securely (password + authenticator app), work a queue of automatically routed cases, move cases through the lifecycle with deadlines and SMS updates, keep internal notes, request information from complainants, file walk-in complaints with a printable slip, and administer users, workflow settings and routing rules — with every view and change audited.

**Architecture:** Builds on Plan 1. Staff pages live under `/[locale]/staff/...` behind `requireStaff()`. Staff *read* through RLS-scoped views/policies keyed on a `staff_role()` SQL helper; all *writes* go through server-side services in `src/lib/cases/*` that check the role first and then use the service role (clients keep zero write grants, per the Plan 1 hardening). Workflow rules (stages, transitions, SLAs, labels) are data in `settings`, read through one module.

**Tech Stack:** as Plan 1, plus Supabase Auth MFA (TOTP) and `otplib` (tests only), Vercel Cron for deadline sweeps.

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md`

## Global Constraints

- All Plan 1 constraints still hold (strict TS, en+sw keys identical, case number format, PIN hashed, audit insert-only, no client write grants on `cases`, `case_events`, `documents`, `profiles`).
- Staff roles: `staff` (intake/investigating officer), `admin`, `commissioner`. `commissioner` reads staff pages in this plan; their own portal is Plan 5.
- Staff and commissioners must have MFA: pages require Supabase AAL `aal2`; an `aal1` session is sent to `/staff/mfa`.
- Staff accounts are created only by an admin (signup stays disabled).
- Stages and default transitions (admin may disable `conciliation`, rename stages, change SLAs; may not add stages):
  `received→screening`, `screening→advocate_notified | closed`, `advocate_notified→investigation`, `investigation→conciliation | hearing | closed`, `conciliation→hearing | closed`, `hearing→decision`, `decision→closed`. Closing requires a reason.
- Default SLA days per stage (time allowed in that stage): `received 3, screening 7, advocate_notified 14, investigation 30, conciliation 21, hearing 14, decision 14`. `advocate_notified` uses `settings.advocate_response_days`.
- Default categories: `withheld_funds, negligence, delay, misconduct, overcharging, conflict_of_interest, other`.
- Event visibility: notes are `internal`; stage changes, info requests/answers, filing are `parties`.
- Every staff view of a case and every evidence download is audited (`view`, `download`) — closes Plan 1 deferred minor.
- Commits carry no co-author trailer.

## Review Focus

1. A `staff` officer (not admin) tries an admin action (create user, change settings) by calling the server action directly → refused, nothing written. (Test in Task 2 and Task 10.)
2. A staff session that passed password but not MFA opens a staff page or calls a staff action → redirected/refused. (Test in Task 1.)
3. Two officers change the same case's stage at once → exactly one transition applies; the other gets "case changed, reload". (Test in Task 4.)
4. Walk-in complainant with no phone → case filed, slip printable with PIN, no SMS attempted, complainant can later use the status page. (Test in Task 8.)
5. Deadline sweep runs twice in the same hour → no duplicate notifications. (Test in Task 6.)

---

### Task 1: Staff sign-in with MFA

**Files:**
- Create: `src/lib/auth/staff.ts`, `src/app/[locale]/staff/login/{page.tsx,LoginForm.tsx,actions.ts}`, `src/app/[locale]/staff/mfa/{page.tsx,MfaForm.tsx,actions.ts}`, `src/app/[locale]/staff/layout.tsx`, `src/app/[locale]/staff/page.tsx` (placeholder heading "Workspace"), `scripts/create-staff.ts`
- Modify: `messages/en.json`, `messages/sw.json` (`staffLogin.*`, `mfa.*`), `tests/helpers/db.ts`, `tests/e2e/helpers.ts`
- Test: `tests/db/staff-auth.test.ts`, `tests/e2e/staff-login.spec.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`, `createServerClient()`, `redirect` from `@/i18n/routing`.
- Produces:
  - `type StaffRole = "staff" | "admin" | "commissioner"`
  - `requireStaff(locale: Locale, roles?: StaffRole[]): Promise<CurrentUser & { role: StaffRole }>` — no user/wrong role → redirect `/staff/login`; AAL `aal1` with a verified factor or no factor → redirect `/staff/mfa`.
  - `assertStaff(roles?: StaffRole[]): Promise<CurrentUser & { role: StaffRole }>` — same checks for server actions; throws `ForbiddenError` instead of redirecting.
  - `class ForbiddenError extends Error`.
  - `/staff/mfa`: if no TOTP factor, enrol (show QR from `mfa.enroll`, then verify); else challenge + verify. Success → `/staff`.
  - Test helper `signInStaff(role, email): Promise<{ client, userId, totpSecret }>` (creates user + profile via admin, enrols TOTP with `otplib`, reaches aal2) and e2e helper `loginAsStaff(page, role)` that types email/password and a code from `otplib.authenticator.generate(secret)`.
  - `scripts/create-staff.ts` (`npx tsx scripts/create-staff.ts <email> <role> <office> "<full name>"`): creates the account with a random temporary password printed once.

- [ ] **Step 1: Failing tests** — `staff-auth.test.ts`: `assertStaff()` logic exercised via a thin `staffGate(user, aal, hasFactor, roles)` pure function (exported from `staff.ts`): complainant → `forbidden`; staff aal1 → `mfa`; staff aal2 → `ok`; staff calling with `roles:["admin"]` → `forbidden`. `staff-login.spec.ts`: wrong password → translated error; correct password lands on `/en/staff/mfa`; visiting `/en/staff` before the code → redirected to `/en/staff/mfa`; valid TOTP → heading "Workspace"; a complainant session visiting `/en/staff` → `/en/staff/login`.
- [ ] **Step 2:** Run `npx vitest run tests/db/staff-auth.test.ts && npx playwright test tests/e2e/staff-login.spec.ts` → FAIL.
- [ ] **Step 3:** Implement `staffGate`, `requireStaff`, `assertStaff`, login + MFA pages (en/sw), create-staff script; `npm i -D otplib tsx`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(staff): password + TOTP sign-in for staff`.

### Task 2: Staff read access (RLS) and admin role guard in SQL

**Files:**
- Create: `supabase/migrations/20261126000001_staff_read.sql`
- Test: `tests/db/rls-staff.test.ts`

**Interfaces:**
- Produces SQL:
  - `staff_role() returns text` (security definer, stable): the caller's role if in (`staff`,`admin`,`commissioner`) **and** `auth.jwt()->>'aal' = 'aal2'`, else null.
  - View `staff_cases` (owner rights, `security_barrier`): every `cases` column except `pin_hash`, plus `complainant_name`, `complainant_phone`, `assigned_officer_name`, `open_deadline_due` (min `due_at` of unmet deadlines, Task 6 table — create the view in Task 6 if ordering requires; see ruling note below), filtered `where staff_role() is not null`.
  - Policies: staff SELECT on `case_events`, `documents` (all visibilities) when `staff_role() is not null`; staff SELECT on `profiles` (all rows); admin SELECT on `audit_log`.
  - No new write grants.
- Note: if `open_deadline_due` needs Task 6's table, create `staff_cases` without it here and `create or replace` it in Task 6.

- [ ] **Step 1: Failing tests:** staff at aal2 sees every case via `staff_cases` but the view has no `pin_hash` column (selecting it errors); staff sees `internal` events; staff at **aal1** sees nothing; complainant sees nothing from `staff_cases`; `staff` cannot read `audit_log`, `admin` can; staff insert into `case_events` → error.
- [ ] **Step 2:** `npx vitest run tests/db/rls-staff.test.ts` → FAIL. **Step 3:** Write + apply migration. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(db): staff read access gated on MFA`.

### Task 3: Workflow settings module

**Files:**
- Create: `supabase/migrations/20261126000002_workflow_settings.sql` (seed keys), `src/lib/cases/workflow-config.ts`
- Modify: `src/lib/cases/stages.ts` (labels may come from overrides), `src/components/case/StageBadge.tsx`, complainant pages that show stage labels, `src/lib/ussd/menu.ts`
- Test: `tests/unit/workflow-config.test.ts`

**Interfaces:**
- Settings keys (jsonb): `sla_days` (object stage→int, defaults above), `conciliation_enabled` (bool, default true), `stage_labels` (`{ en: Partial<Record<Stage,string>>, sw: ... }`, default `{}`), `categories` (string[] defaults above).
- Produces:
  - `TRANSITIONS: Record<Stage, Stage[]>` (constants above).
  - `interface WorkflowConfig { slaDays: Record<Stage, number>; conciliationEnabled: boolean; stageLabels: Record<Locale, Partial<Record<Stage, string>>>; categories: string[]; advocateResponseDays: number }`
  - `loadWorkflowConfig(): Promise<WorkflowConfig>` (admin client, cached per request with React `cache`).
  - `allowedNextStages(from: Stage, cfg: WorkflowConfig): Stage[]` — drops `conciliation` when disabled.
  - `slaDaysFor(stage: Stage, cfg): number | null` — `null` for `closed`; `advocate_notified` returns `advocateResponseDays`.
  - `labelFor(stage: Stage, locale: Locale, cfg, t): string` — override, else translation.
- USSD and complainant pages use `labelFor` so admin renames show everywhere.

- [ ] **Step 1: Failing tests:** `allowedNextStages("investigation", cfg)` with conciliation on → `["conciliation","hearing","closed"]`, off → `["hearing","closed"]`; `allowedNextStages("closed")` → `[]`; `slaDaysFor("advocate_notified")` returns the response-days value; `labelFor` uses an override and falls back otherwise; every stage except `closed` has a transition.
- [ ] **Step 2–4:** FAIL → implement + apply seed migration → PASS (`npx vitest run tests/unit`).
- [ ] **Step 5:** Commit `feat: configurable workflow settings`.

### Task 4: Case actions service (stage, notes, assignment, info requests)

**Files:**
- Create: `supabase/migrations/20261126000003_case_actions.sql`, `src/lib/cases/actions.ts`
- Modify: `src/lib/cases/messages.ts` (`infoRequested` SMS en/sw ≤160 chars)
- Test: `tests/db/case-actions.test.ts`

**Interfaces:**
- SQL: `transition_case_stage(p_case_id uuid, p_from text, p_to text, p_actor uuid, p_reason text) returns boolean` — `update cases set stage=p_to where id=p_case_id and stage=p_from` and inserts the `stage_changed` event `{from,to,reason}` (visibility `parties`) in the same transaction; returns false if 0 rows (stale). Service role only.
- Produces in `actions.ts` (each first calls `assertStaff()` unless given an explicit `actor` in tests via an internal `*_as` variant — see below):
  - `changeStage(caseId: string, from: Stage, to: Stage, reason?: string): Promise<{ ok: true } | { ok: false; reason: "not_allowed" | "stale" | "reason_required" }>` — checks `allowedNextStages`; `closed` needs a reason; on success: sends `smsText.statusChanged` to the complainant (if phone) in the case language, and calls `openStageDeadline(caseId, to)` (Task 6; until then a no-op import stub is acceptable — ruling).
  - `addNote(caseId: string, text: string): Promise<void>` — event `note`, `internal`, body `{text}`; text 1–5000 chars.
  - `assignCase(caseId: string, officerId: string | null): Promise<void>` — officer must have role `staff` or `admin`; event `assigned` (`internal`).
  - `setCategoryPriority(caseId: string, category: string | null, priority: "low"|"normal"|"high"|"urgent"): Promise<void>` — category must be in `cfg.categories`; event `triaged` (`internal`).
  - `requestInfo(caseId: string, message: string, dueDays: number): Promise<void>` — event `info_requested` (`parties`, body `{message, due_at}`), deadline kind `info_request` (Task 6), SMS `infoRequested`.
- Testability: each exported function is `fn(...) = fnAs(await assertStaff(), ...)`; tests call the exported `*As(actor, ...)` variants with a profile from `signInStaff`.

- [ ] **Step 1: Failing tests:** valid transition writes stage + one `stage_changed` event + one SMS; invalid transition (`received→hearing`) → `not_allowed`, nothing written; closing without reason → `reason_required`; two concurrent `changeStageAs` from `received→screening` → exactly one `{ok:true}`, one `stale`, exactly one event; note is `internal` and invisible to the complainant client; assigning to a complainant id → throws; `requestInfo` writes a `parties` event and sends SMS containing the case number.
- [ ] **Step 2–4:** FAIL → implement + apply migration → PASS (`npx vitest run tests/db/case-actions.test.ts`).
- [ ] **Step 5:** Commit `feat: case actions service with race-safe stage transitions`.

### Task 5: Automatic routing

**Files:**
- Create: `supabase/migrations/20261126000004_routing.sql`, `src/lib/cases/routing.ts`
- Modify: `src/app/[locale]/(complainant)/my/file/actions.ts` (route after filing), `src/lib/cases/actions.ts` (re-route on `setCategoryPriority` when unassigned)
- Test: `tests/db/routing.test.ts`

**Interfaces:**
- Table `routing_rules(id uuid pk, position int, category text null, priority text null, office text null, officer_ids uuid[] not null, active bool default true, created_at)`; RLS on, staff SELECT, no client writes.
- Produces:
  - `pickOfficer(c: { category: string|null; priority: string; office: string|null }, rules: RoutingRule[], openCounts: Map<string, number>): string | null` — first active rule (by `position`) whose non-null fields all match; among its `officer_ids`, the one with fewest open (non-closed) cases, ties by id order; no matching rule → all active `staff` profiles; none → null. Pure function.
  - `routeCase(caseId: string): Promise<string | null>` — loads rules + open counts, assigns via `assignCaseAs(systemActor, ...)`, event `assigned` body `{auto:true}`; returns officer id or null (stays in unassigned queue).
- Filing (online now, walk-in in Task 8) calls `routeCase` after `fileComplaint`; a routing failure must not fail the filing (log internal `routing_failed` event).

- [ ] **Step 1: Failing tests:** pure `pickOfficer` table: rule order respected; null fields are wildcards; least-loaded wins; inactive rule skipped; no rules → least-loaded of all staff; empty → null. DB: filing a complaint as a complainant ends with `assigned_officer_id` set and an `assigned` event.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx vitest run tests/unit tests/db/routing.test.ts`).
- [ ] **Step 5:** Commit `feat: rule-based, workload-aware case routing`.

### Task 6: Deadlines and alerts

**Files:**
- Create: `supabase/migrations/20261126000005_deadlines.sql`, `src/lib/cases/deadlines.ts`, `src/app/api/cron/deadlines/route.ts`, `vercel.json`
- Modify: `src/lib/cases/actions.ts` (wire `openStageDeadline`, info-request deadline), staff view `staff_cases` (`open_deadline_due`)
- Test: `tests/db/deadlines.test.ts`

**Interfaces:**
- Tables: `case_deadlines(id uuid pk, case_id, kind text check in ('stage','info_request','advocate_response'), stage text null, due_at timestamptz, met_at timestamptz null, created_at)`; `notifications(id uuid pk, user_id uuid, case_id uuid, deadline_id uuid null, kind text check in ('due_soon','overdue','assigned','info_provided'), created_at, read_at null, unique(deadline_id, kind))`. RLS: staff read deadlines; a user reads/updates (`read_at` only) own notifications.
- Produces:
  - `openStageDeadline(caseId: string, stage: Stage): Promise<void>` — closes (`met_at=now()`) any open `stage` deadline for the case, opens one for `stage` with `slaDaysFor` (none for `closed`).
  - `addDeadline(caseId, kind, dueAt: Date): Promise<string>`; `meetDeadlines(caseId, kind): Promise<void>`.
  - `sweepDeadlines(now: Date): Promise<{ dueSoon: number; overdue: number }>` — for unmet deadlines: `due_at - now ≤ 48h` → `due_soon`; `due_at < now` → `overdue`; notification to the assigned officer (or all admins if unassigned); `insert ... on conflict do nothing`.
  - `GET /api/cron/deadlines` — requires header `Authorization: Bearer ${CRON_SECRET}`; calls `sweepDeadlines(new Date())`; `vercel.json` schedules it hourly.
- Filing opens the `received` deadline (call from `fileComplaint` callers after routing).

- [ ] **Step 1: Failing tests:** stage change closes the old deadline and opens the new one with the SLA; `closed` opens none; sweep at `due−24h` creates one `due_soon`; sweep again → still one; sweep after due → one `overdue`; unassigned case notifies admins; cron route without the secret → 401.
- [ ] **Step 2–4:** FAIL → implement + apply migration → PASS (`npx vitest run tests/db/deadlines.test.ts`).
- [ ] **Step 5:** Commit `feat: case deadlines with hourly alert sweep`.

### Task 7: Staff workspace UI — queue and case page

**Files:**
- Create: `src/app/[locale]/staff/page.tsx` (replace placeholder), `src/app/[locale]/staff/cases/[caseNumber]/{page.tsx,CaseActions.tsx,actions.ts}`, `src/components/staff/{StaffNav.tsx,CaseTable.tsx,NotificationBell.tsx}`, `src/app/api/documents/[id]/route.ts`
- Modify: `src/components/case/Timeline.tsx` (render notes/assigned/triaged/info events; show internal badge when `showInternal`), complainant case page (download links go through the new route)
- Test: `tests/e2e/staff-workspace.spec.ts`

**Interfaces:**
- Workspace `/staff`: tabs "My cases", "Unassigned", "Overdue", "All" (reads `staff_cases`; search by case number/advocate/complainant; 25 per page); notification bell with unread count.
- Case page: header (number, stage badge, priority, category, officer, next deadline), complaint text, complainant contact (staff only), documents, full timeline incl. internal, and forms: change stage (only `allowedNextStages`; reason box when closing), add note, assign (officer select), triage (category/priority), request info (message + days). Each form posts to a server action wrapping Task 4/5 functions; stale → translated "This case was changed by someone else. Reload." Page view → `logAudit view`.
- `GET /api/documents/[id]` — checks the caller may see the document (complainant: own case & not internal; staff: aal2), logs `download`, redirects to a 60-second signed URL.

- [ ] **Step 1: Failing test (e2e):** file a complaint as a complainant; log in as staff (TOTP); case appears in "My cases" or "Unassigned"; open it; add note; triage `withheld_funds/high`; move `received→screening`; complainant's page then shows stage "Screening" and does **not** show the note; an `audit_log` `view` row exists for the staff user; downloading a document creates a `download` row.
- [ ] **Step 2–4:** FAIL → implement (en+sw strings) → PASS (`npx playwright test tests/e2e/staff-workspace.spec.ts`).
- [ ] **Step 5:** Commit `feat(staff): workspace queue and case management page`.

### Task 8: Assisted walk-in intake with printable slip

**Files:**
- Create: `src/lib/auth/accounts.ts`, `src/app/[locale]/staff/intake/{page.tsx,IntakeForm.tsx,actions.ts}`, `src/app/[locale]/staff/intake/slip/[caseNumber]/page.tsx`
- Modify: `src/lib/auth/otp.ts` (use `ensureComplainantForPhone` from `accounts.ts`)
- Test: `tests/db/walk-in.test.ts`, `tests/e2e/walk-in.spec.ts`

**Interfaces:**
- `ensureComplainantForPhone(e164: string, locale: Locale, fullName?: string): Promise<string>` — moved from `otp.ts` unchanged in behaviour.
- `createWalkInComplainant(fullName: string, locale: Locale): Promise<string>` — auth user with email `walkin-<uuid>@walkin.mizani.local`, profile `{role:'complainant', phone:null, full_name}`.
- `fileWalkInComplaint(form: { fullName: string; phone?: string; locale: Locale } & ComplaintInput, files: File[]): Promise<FiledCase>` — `assertStaff(["staff","admin"])`; phone given → `ensureComplainantForPhone`, else `createWalkInComplainant`; `fileComplaint(..., { channel:'walk_in', filedBy: staff.id, office: staff.office })`; then `routeCase`, open `received` deadline. Consent checkbox is "complainant consented verbally/in writing" ticked by staff.
- Slip page `/staff/intake/slip/[caseNumber]`: shows case number, office, date, status-check instructions (web URL + USSD), and the PIN **only** when passed through a one-time server-side handoff: the intake action stores `{caseNumber, pin}` in an httpOnly cookie `slip` (5-minute expiry, path `/staff/intake/slip`), the slip page reads and deletes it. Print stylesheet hides navigation. PIN never in URL.

- [ ] **Step 1: Failing tests:** db: walk-in with phone reuses an existing complainant profile for that phone; walk-in without phone creates a phone-less complainant, files with `channel='walk_in'`, `filed_by` = staff, `office` = staff office, sends no SMS, and `checkStatus(caseNumber, pin, 'web', ip)` works; a `complainant` calling `fileWalkInComplaint` → `ForbiddenError`. e2e: staff completes intake in Swahili, lands on the slip with case number and 6-digit PIN; reloading the slip no longer shows the PIN.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx vitest run tests/db/walk-in.test.ts && npx playwright test tests/e2e/walk-in.spec.ts`).
- [ ] **Step 5:** Commit `feat(staff): assisted walk-in intake with printable slip`.

### Task 9: Complainant answers information requests

**Files:**
- Create: `src/lib/cases/respond.ts`, `src/app/[locale]/(complainant)/my/cases/[caseNumber]/{RespondForm.tsx,actions.ts}`
- Modify: complainant case page (show open request + form)
- Test: `tests/db/respond.test.ts`, `tests/e2e/respond.spec.ts`

**Interfaces:**
- `openInfoRequest(caseId: string): Promise<{ eventId: string; message: string; dueAt: string } | null>` — latest `info_requested` event with no later `info_provided`.
- `respondToInfoRequest(caseId: string, userId: string, text: string, files: File[]): Promise<void>` — caller must be the case's complainant; text 1–5000; evidence via `validateEvidence`; uploads like `fileComplaint`; event `info_provided` (`parties`); `meetDeadlines(caseId,'info_request')`; notification `info_provided` to the assigned officer.

- [ ] **Step 1: Failing tests:** db: response writes event + documents, meets the deadline, notifies the officer; another complainant → throws; no open request → throws. e2e: staff requests info; complainant sees the request on their case page, answers with a PDF; staff case page timeline shows "Information provided".
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: complainants answer information requests`.

### Task 10: Administration — users, workflow settings, routing rules, audit viewer

**Files:**
- Create: `src/lib/admin/{users.ts,settings.ts,routing-rules.ts}`, `src/app/[locale]/staff/admin/{page.tsx,users/page.tsx,settings/page.tsx,routing/page.tsx,audit/page.tsx}` with client forms + `actions.ts` per page
- Test: `tests/db/admin.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces (all call `assertStaff(["admin"])` first; each change audited with `action` `admin_*` and before/after in `details`):**
- `createStaffUser({ email, fullName, role: StaffRole, office }): Promise<{ userId: string; tempPassword: string }>`; `setUserActive(userId, active: boolean)` (Supabase `ban_duration` `"876000h"` / `"none"`); `changeUserRole(userId, role)` — an admin cannot demote or deactivate themself.
- `updateWorkflowSettings(patch: Partial<{ slaDays; conciliationEnabled; stageLabels; categories; advocateResponseDays }>)` — zod-validated (SLA 1–365, labels ≤40 chars, ≥1 category, response days 7–60).
- `saveRoutingRule(rule)`, `deleteRoutingRule(id)`, `reorderRoutingRules(ids: string[])`.
- `/staff/admin/audit`: filter by case number, actor, action, date range; 50 per page; CSV export of the filtered rows.

- [ ] **Step 1: Failing tests:** db: `staff` role calling each admin function → `ForbiddenError`, nothing written; admin creates a staff user who can then sign in with the temp password; deactivated user cannot sign in; admin cannot deactivate self; renaming `screening` (sw) changes the USSD reply label; invalid SLA (0) rejected; every admin change writes an `admin_*` audit row. e2e: admin adds a routing rule for `withheld_funds` → newly triaged unassigned case is routed to that officer.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(admin): users, workflow settings, routing rules and audit viewer`.

### Task 11: Demo data and docs

**Files:**
- Create: `scripts/seed-demo.ts` (synthetic: 1 admin, 3 officers in Nairobi/Mombasa/Kisumu, 25 cases across all stages/categories with notes, deadlines incl. overdue; prints logins + TOTP secrets once)
- Modify: `README.md` (staff routes, demo logins how-to, cron), `docs/deploy.md` (`CRON_SECRET`, MFA note, creating the first admin)

- [ ] **Step 1:** Run `npx tsx scripts/seed-demo.ts` against the dev project; Expected: prints 4 accounts, "25 cases created".
- [ ] **Step 2:** Run full suite `npm test && npm run test:e2e && npm run build`; Expected: all pass, build succeeds.
- [ ] **Step 3:** Commit `docs: staff workspace setup and demo data`.
