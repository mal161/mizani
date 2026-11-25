# Plan 1 — Foundation & Complainant Filing/Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Mizani app where a member of the public can file a complaint (online, EN/SW), get a case number + PIN, and track it on the web or by USSD — on a schema with RLS and an append-only audit log that later plans build on.

**Architecture:** Next.js App Router (TypeScript) monolith with locale-prefixed routes (`/en`, `/sw`) and route groups per portal. Supabase Postgres holds all data with RLS enforcing visibility; server actions call Supabase with the user's session. External services (SMS, later AI) sit behind provider interfaces with fake implementations for tests.

**Tech Stack:** Next.js 15, TypeScript (strict), Supabase (Postgres, Auth phone OTP, Storage) via Supabase CLI local stack, `@supabase/ssr`, next-intl, zod, Tailwind + shadcn/ui, Vitest, Playwright, Africa's Talking (sandbox).

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md`

**Later plans (not in this one):** 2 Staff workspace (assisted intake, routing, timeline, deadlines, admin) · 3 AI triage (provider adapter, redaction, kill switch) · 4 Advocate portal · 5 Commissioner portal · 6 Analytics + handover docs.

## Global Constraints

- TypeScript `strict: true`; no `any` in app code.
- Locales: `en` (default) and `sw`; every user-facing string in `messages/en.json` and `messages/sw.json`.
- Case number format: `ACC/<YYYY>/<6-digit zero-padded sequence>`, e.g. `ACC/2026/000123`.
- Status PIN: 6 digits, stored only as a hash (bcrypt), shown once.
- Visibility: complainant sees only own cases and only events with `visibility in ('public','parties')`; never `internal`.
- Audit table `audit_log` is insert-only for all roles (no UPDATE/DELETE policies, plus a trigger that raises on update/delete).
- All case-record reads in the app call `logAudit` with action `'view'`.
- Demo/synthetic data only; no real personal data in seeds.
- Default advocate response window: 14 days (stored in `settings`, used by Plan 4).

## Review Focus

1. Complainant A opens complainant B's case URL directly → must get 404, not data. (Test in Task 3.)
2. USSD status check with wrong PIN repeatedly → locked after 5 failures per case per hour, same generic message for unknown case and wrong PIN. (Test in Task 8.)
3. Two complaints filed at the same instant → distinct, sequential case numbers. (Test in Task 2.)
4. Evidence upload of a disallowed type or >10 MB → rejected with a translated message; complaint not half-created. (Test in Task 6.)
5. Swahili user sees no untranslated keys → en/sw message files have identical key sets. (Test in Task 1.)

---

### Task 1: Project scaffold, i18n, test harness

**Files:**
- Create: Next.js app at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/middleware.ts`, `messages/en.json`, `messages/sw.json`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`)
- Test: `tests/unit/i18n-keys.test.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**
- Produces: `routing` (next-intl) with `locales: ['en','sw']`, `defaultLocale: 'en'`; npm scripts `dev`, `test` (vitest), `test:e2e` (playwright), `db:reset` (`supabase db reset`).

- [ ] **Step 1:** `git init`; `npx create-next-app@15 . --ts --app --src-dir --tailwind --eslint`; add next-intl, zod, vitest, @playwright/test; `npx supabase init`; `npx shadcn init`.
- [ ] **Step 2: Write failing test** `tests/unit/i18n-keys.test.ts`: `expect(flattenKeys(sw)).toEqual(flattenKeys(en))` (sorted dotted keys).
- [ ] **Step 3:** Run `npm test` → FAIL (files missing).
- [ ] **Step 4:** Add next-intl routing + middleware; message files with `home.title` ("Mizani — Advocates Complaints Commission" / "Mizani — Tume ya Malalamiko dhidi ya Mawakili") and `home.fileComplaint` / `home.trackCase`; home page with language switcher.
- [ ] **Step 5:** e2e `home.spec.ts`: `/sw` shows Swahili title; `/` redirects to `/en`.
- [ ] **Step 6:** Run `npm test && npm run test:e2e` → PASS.
- [ ] **Step 7:** Commit `chore: scaffold Next.js app with i18n and test harness`.

### Task 2: Core schema, case numbers, audit log

**Files:**
- Create: `supabase/migrations/0001_core.sql`, `supabase/seed.sql`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/db/types.ts` (generated)
- Test: `tests/db/schema.test.ts`, `tests/helpers/db.ts`

**Interfaces:**
- Produces tables:
  - `profiles(id uuid pk → auth.users, role text check in ('complainant','advocate','staff','admin','commissioner'), full_name text, phone text, preferred_locale text default 'en', office text null)`
  - `advocates(id uuid pk, admission_no text unique, full_name text, phone text, email text, firm text, profile_id uuid null → profiles)` — seeded LSK roll (synthetic, ≥50 rows)
  - `cases(id uuid pk, case_number text unique, complainant_id uuid → profiles, advocate_id uuid → advocates null, advocate_name_given text, category text null, stage text default 'received', priority text default 'normal', summary text, description text, language text, channel text check in ('online','walk_in'), pin_hash text, assigned_officer_id uuid null, filed_by uuid → profiles, office text null, created_at timestamptz)`
  - `case_events(id uuid pk, case_id → cases, type text, visibility text check in ('public','parties','internal'), actor_id uuid null, body jsonb, created_at)`
  - `documents(id uuid pk, case_id, storage_path text, file_name text, mime text, size_bytes int, uploaded_by uuid, visibility text, created_at)`
  - `audit_log(id bigserial pk, at timestamptz default now(), actor_id uuid null, actor_channel text, action text, entity text, entity_id text, details jsonb)`
  - `settings(key text pk, value jsonb)` seeded with `advocate_response_days = 14`, `ai_enabled = true`
- Produces SQL function `next_case_number() returns text` using a per-year sequence table with row lock.
- Produces `createServerClient()` (user session) and `createAdminClient()` (service role, server-only).
- Write triggers: `audit_row_change()` on `cases`, `case_events`, `documents` inserting into `audit_log`; `audit_log_immutable()` raising on UPDATE/DELETE.

- [ ] **Step 1: Write failing tests** `schema.test.ts`: (a) 20 concurrent `next_case_number()` calls return 20 distinct values matching `/^ACC\/2026\/\d{6}$/`, sequential; (b) inserting a case writes an `audit_log` row with `action='insert'`, `entity='cases'`; (c) `update audit_log ...` as service role raises.
- [ ] **Step 2:** `npx supabase start && npm test -- tests/db` → FAIL.
- [ ] **Step 3:** Write migration + seed; `npm run db:reset`; generate types `supabase gen types typescript --local > src/lib/db/types.ts`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat(db): core schema, case numbers, immutable audit log`.

### Task 3: RLS policies for complainants

**Files:**
- Create: `supabase/migrations/0002_rls_complainant.sql`
- Test: `tests/db/rls-complainant.test.ts`, extend `tests/helpers/db.ts` with `signInAs(role, phone): SupabaseClient`

**Interfaces:**
- Produces policies: complainant SELECT on own `cases`; SELECT on `case_events`/`documents` of own cases where `visibility <> 'internal'`; INSERT on `cases` only with `complainant_id = auth.uid()` and `channel='online'`; no access to `audit_log`, `settings` write, other profiles. `pin_hash` excluded via a view `my_cases` (complainants query the view, not the table).

- [ ] **Step 1: Failing tests:** complainant A cannot select B's case (0 rows); A sees own `parties` event but not `internal` event; A cannot read `pin_hash`; A cannot insert case for B.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write policies + view. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): complainant row-level security`.

### Task 4: Audit + PIN utilities

**Files:**
- Create: `src/lib/audit.ts`, `src/lib/pin.ts`
- Test: `tests/unit/pin.test.ts`, `tests/db/audit.test.ts`

**Interfaces:**
- Produces `logAudit(e: { actorId: string | null; channel: 'web'|'ussd'|'sms'|'system'; action: 'view'|'download'|'status_check'|string; entity: string; entityId: string; details?: Record<string, unknown> }): Promise<void>` (uses admin client).
- Produces `generatePin(): string` (crypto-random, 6 digits, leading zeros allowed), `hashPin(pin): Promise<string>`, `verifyPin(pin, hash): Promise<boolean>`.

- [ ] **Step 1: Failing tests:** `generatePin()` matches `/^\d{6}$/` over 1000 runs; verify true for right PIN, false for wrong; `logAudit` inserts a row readable by admin client.
- [ ] **Step 2–4:** Run FAIL → implement (bcryptjs) → PASS.
- [ ] **Step 5:** Commit `feat: audit logger and PIN utilities`.

### Task 5: SMS provider + complainant phone login

**Files:**
- Create: `src/lib/sms/provider.ts`, `src/lib/sms/africastalking.ts`, `src/lib/sms/fake.ts`, `src/lib/sms/index.ts`, `src/app/[locale]/(public)/login/page.tsx`, `src/app/[locale]/(public)/login/actions.ts`
- Test: `tests/unit/sms.test.ts`, `tests/e2e/login.spec.ts`

**Interfaces:**
- Produces `interface SmsProvider { send(to: string, message: string): Promise<{ id: string }> }`; `getSmsProvider(): SmsProvider` (env `SMS_PROVIDER=fake|africastalking`); `FakeSms.sent: {to,message}[]`.
- Produces `normalizeKenyanPhone(input: string): string | null` → E.164 (`0712345678`, `712345678`, `+254712345678` → `+254712345678`; invalid → null).
- Login: Supabase phone OTP; local config uses test OTP (`supabase/config.toml` `[auth.sms.test_otp]`). First login creates `profiles` row role `complainant` with locale.

- [ ] **Step 1: Failing tests:** phone normalization table above; e2e: enter `0712000001`, test OTP `123456`, land on `/en/my/cases`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: SMS provider abstraction and complainant phone login`.

### Task 6: File a complaint (online)

**Files:**
- Create: `src/lib/cases/schema.ts`, `src/lib/cases/file-complaint.ts`, `src/lib/cases/messages.ts`, `src/app/[locale]/(complainant)/my/file/page.tsx`, `.../file/ComplaintForm.tsx`, `.../file/actions.ts`, `src/app/[locale]/(complainant)/my/file/success/page.tsx`
- Test: `tests/unit/complaint-schema.test.ts`, `tests/db/file-complaint.test.ts`, `tests/e2e/file-complaint.spec.ts`

**Interfaces:**
- Produces `complaintSchema` (zod): `advocateId?: uuid`, `advocateNameGiven: string 2–120`, `summary: string 10–200`, `description: string 30–10000`, `language: 'en'|'sw'`, `consentDataProcessing: literal(true)`; files: max 5, ≤10 MB each, mime in `application/pdf, image/jpeg, image/png`.
- Produces `fileComplaint(input: ComplaintInput, files: File[], ctx: { userId: string; channel: 'online'|'walk_in'; filedBy: string; office?: string }): Promise<{ caseId: string; caseNumber: string; pin: string }>` — reused by Plan 2 assisted intake. Validates files before any insert; on upload failure deletes the created case (compensating). Inserts `case_events` `{type:'filed', visibility:'parties'}`. Sends SMS `smsText.filed(locale, caseNumber, pin)`.
- Produces `smsText` in `src/lib/cases/messages.ts`: `filed`, `statusChanged` in en/sw, each ≤160 chars.
- Advocate picker: searches `advocates` by name/admission no.; free-text fallback stored in `advocate_name_given`.
- Data-processing consent text (en/sw) shown on the form (DPA).

- [ ] **Step 1: Failing tests:** schema rejects 11 MB file and `.exe`; `fileComplaint` returns `ACC/2026/xxxxxx` + 6-digit pin, stores hash not pin, writes `filed` event, sends 1 fake SMS containing case number; bad file → no case row created; e2e files in Swahili and sees success page with case number and PIN.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test && npm run test:e2e`).
- [ ] **Step 5:** Commit `feat: online complaint filing with evidence and SMS confirmation`.

### Task 7: Complainant case list and case detail

**Files:**
- Create: `src/app/[locale]/(complainant)/my/cases/page.tsx`, `.../my/cases/[caseNumber]/page.tsx`, `src/components/case/Timeline.tsx`, `src/components/case/StageBadge.tsx`, `src/lib/cases/stages.ts`
- Test: `tests/e2e/track-case.spec.ts`, `tests/unit/stages.test.ts`

**Interfaces:**
- Produces `STAGES = ['received','screening','advocate_notified','investigation','conciliation','hearing','decision','closed'] as const`, `type Stage`, `stageLabel(stage, t)` (translated; admin renames come in Plan 2 via `settings.stage_labels`).
- Detail page: loads via `my_cases` view (case number URL-encoded), calls `logAudit({action:'view'})`, shows Timeline (non-internal events), documents with signed URLs (60s), and "respond to information request" placeholder for Plan 2.

- [ ] **Step 1: Failing tests:** stage list order; e2e: user A sees own case & timeline; visiting B's case number → 404; viewing creates an audit `view` row.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: complainant case tracking with audited views`.

### Task 8: Public status check — web and USSD

**Files:**
- Create: `src/lib/cases/status-check.ts`, `src/app/[locale]/(public)/status/page.tsx`, `src/app/api/ussd/route.ts`, `src/lib/ussd/menu.ts`, `supabase/migrations/0003_status_attempts.sql`
- Test: `tests/unit/ussd-menu.test.ts`, `tests/db/status-check.test.ts`

**Interfaces:**
- Produces `checkStatus(caseNumber: string, pin: string, channel: 'web'|'ussd'): Promise<{ ok: true; stage: Stage; updatedAt: string } | { ok: false; reason: 'invalid' | 'locked' }>` — unknown case and wrong PIN both return `'invalid'`; 5 failures per case per rolling hour → `'locked'`; every attempt audited as `status_check`.
- Table `status_attempts(case_number text, at timestamptz, success bool)`.
- USSD (Africa's Talking format: POST `sessionId, phoneNumber, text`, reply `CON ...`/`END ...`): `ussdResponse(text: string, check: typeof checkStatus): Promise<string>` — `""` → `CON 1. English\n2. Kiswahili`; then case number entry (accept `2026000123` or full form), then PIN, then `END` with stage label in chosen language.

- [ ] **Step 1: Failing tests:** menu flow strings for `""`, `"1"`, `"1*2026000123"`, `"1*2026000123*123456"`; 6th wrong PIN → `locked`; unknown case → `invalid`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Manual: point Africa's Talking sandbox USSD callback to an ngrok URL of `/api/ussd`, dial in simulator, see status.
- [ ] **Step 6:** Commit `feat: public status check via web and USSD`.

### Task 9: Deploy preview

**Files:**
- Create: `README.md` (setup, env vars, demo logins), `docs/deploy.md`

- [ ] **Step 1:** Create hosted Supabase project; `supabase db push`; run seed (synthetic only).
- [ ] **Step 2:** Deploy to Vercel with env vars from `.env.example`; `SMS_PROVIDER=africastalking` sandbox.
- [ ] **Step 3:** Smoke test on the deployed URL: file a complaint in Swahili, check status via web; Expected: case number shown, status "Received/Imepokelewa".
- [ ] **Step 4:** Commit `docs: setup and deployment guide`.
