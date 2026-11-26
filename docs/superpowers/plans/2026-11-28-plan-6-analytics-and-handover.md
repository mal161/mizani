# Plan 6 — Analytics and ACC Handover Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commissioners and admins get an analytics dashboard: resolution times, bottleneck stages, officer workload, complaint-category trends, repeat advocates and decision outcomes, filtered by period and office, with CSV export. The ACC gets a handover pack it can operate from: a self-hosting guide with a container build, an operations runbook, a data-protection pack (personal-data inventory, DPIA and ODPC checklist, AI-provider decision), a security model, role user guides and a health endpoint.

**Architecture:** Metrics are computed in Postgres by `security definer` SQL functions, executable only by `service_role`. Only aggregates leave the database, plus advocate names from the public roll and officer names. A role-checked `analyticsAs(actor, period, office)` service calls them. The dashboard is server-rendered with dependency-free SVG/CSS charts, and every chart also has a data table. The handover pack is Markdown under `docs/handover/`, checked by a unit test for broken links and undocumented env vars.

**Tech Stack:** as Plans 1–5 (Next.js 15, Supabase, next-intl, Vitest, Playwright, Roboto). No new runtime dependencies. Docker for the container build.

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md`. Sections implemented here:
- §2.5: resolution times, bottleneck stages, officer workload/performance, category trends, repeat-advocate patterns.
- §3: the commissioner analytics dashboard.
- §7: the handover document for ACC-owned infrastructure in Kenya.
- §9: the DPA handover note on in-country requirements, the DPIA, ODPC registration and the AI provider.

## Global Constraints

- All Plan 1–5 constraints hold: strict TS, en/sw parity, no client write grants, role-checked services, every read and change audited with the actor, demo data only, Roboto UI, no co-author trailers.
- **Who:** commissioners and admins see analytics; officers do not, because the data includes colleagues' workload. Use `COMMISSION_ROLES` from `src/lib/commission/roles.ts`.
- **Data minimisation:**
  - Analytics never return complainant names, phones, case text or AI output.
  - Advocate names and admission numbers (public roll) and officer names may appear.
  - Case numbers do not appear in analytics.
- **Auditing:** page views are audited as `view_analytics` and CSV downloads as `export_analytics`. Both use entity `analytics`, entity id `*`, with `{ period, office, section? }` in details.
- **Time:**
  - Periods are half-open `[from, to)`.
  - Month buckets and date inputs use Africa/Nairobi.
  - Durations are in days, rounded to 1 decimal.
  - Empty sets give `null`, shown as "—". Never divide by zero.
- **Stages, in this canonical order:** `received, screening, advocate_notified, investigation, conciliation, hearing, decision, closed`.
  - A case's time in a stage is a "stay": from entering the stage (`cases.created_at` for `received`, otherwise the `stage_changed` event with `body.to = stage`) to the next `stage_changed` event.
  - A case can have several stays in the same stage (moved back), and each stay counts.
  - A case is "closed in period" if its **latest** `stage_changed` to `closed` falls in the period.
- **Upheld outcomes** (for repeat advocates): `admonished`, `refund_ordered`, `referred_to_tribunal`. Only active decisions (`superseded_by is null`) count.
- **CSV:** quote every cell, neutralise leading `= + - @ \t \r` with a `'` prefix, and use CRLF line endings. This is the existing audit-export behaviour, moved to a shared helper.
- **Charts:** no chart library. Load the `dataviz` skill before writing chart components.

## Review Focus

1. **A new office or an empty period:** every section renders its "no data" state, medians and percentages show "—", and nothing returns a 500. Tested in Task 1 (empty-office RPC results) and Task 3 (e2e with an office that has no cases).
2. **Bad custom dates in the URL:** `from` after `to`, `2026-13-45`, or a 20-year span. The page and the export fall back to the default 90 days without error. Tested in Task 2 (unit tests of `parsePeriod`).
3. **An officer or complainant opens `/commission/analytics` or `/api/analytics/export` directly:** a page 403 for staff and a login redirect for complainants. The export returns 403 and writes no audit row. Tested in Task 3 (e2e and route test).
4. **Cases moved backwards or reopened** (decision → hearing → decision, or closed → investigation → closed): every stay counts and resolution uses the latest close. Tested in Task 1.
5. **Names that break CSV:** an advocate named `=HYPERLINK(...)`, or names containing commas, quotes or newlines, are escaped and neutralised. Tested in Task 2.

---

### Task 1: Analytics SQL functions

**Files:**
- Create: `supabase/migrations/20261201000001_analytics.sql`. Apply it with the Supabase MCP `apply_migration` to project `wkxcpzhfjdgvfsukzmyc` and keep the file.
- Test: `tests/db/analytics.test.ts`

**Interfaces:**
- **Common to every function:**
  - `p_from timestamptz, p_to timestamptz, p_office text default null`. A null office means all offices, and filters on `cases.office`.
  - `language sql` or `plpgsql`, `stable`, `security definer`, `set search_path = public`.
  - `revoke execute … from public, anon, authenticated; grant execute … to service_role`.
- `analytics_overview(p_from, p_to, p_office) returns jsonb` with keys:
  - Filing: `filed` (cases created in period), `filed_online`, `filed_walk_in`, `filed_sw`.
  - Progress: `closed` (latest close in period), `open_now` (stage ≠ closed, ignores the period), `median_resolution_days` (closed-in-period: latest close − created_at).
  - Deadlines: `deadlines_due` (due in period and due_at < now()), `deadlines_met` (of those, `met_at <= due_at`).
  - Decisions: `decisions` (active decisions decided in period), `outcomes` (object outcome → count), `refunds_kes` (sum of `amount_kes`, active `refund_ordered` decisions decided in period).
- `analytics_stage_times(p_from, p_to, p_office) returns table(stage text, entered int, median_days numeric, p90_days numeric, open_now int, overdue_now int)`:
  - Stays counted are those entered in the period. Medians and p90 use completed stays only (`percentile_cont`).
  - `open_now` is cases currently in the stage.
  - `overdue_now` is open `case_deadlines` of kind `stage` for that stage with `due_at < now()`.
  - One row per stage except `closed`, in canonical order. Rows with no data are still returned, with 0 counts and null durations.
- `analytics_officers(p_from, p_to, p_office) returns table(officer_id uuid, full_name text, office text, open_now int, assigned_in_period int, closed_in_period int, median_resolution_days numeric, overdue_now int)`:
  - Covers active profiles with role `staff` or `admin`. When `p_office` is set, both `profiles.office` and the cases are filtered.
  - Sorted by `open_now desc, full_name`.
- `analytics_categories(p_from, p_to, p_office) returns table(month date, category text, filed int)`:
  - `month` is the first day of the Nairobi month of `created_at`.
  - A null category becomes `'uncategorised'`.
  - Sorted by `month, category`.
- `analytics_repeat_advocates(p_from, p_to, p_office, p_min int default 2) returns table(advocate_id uuid, full_name text, admission_no text, complaints int, open_now int, upheld int, referred int, last_filed timestamptz)`:
  - Covers cases with `advocate_id` set that were created in the period, `having count(*) >= p_min`.
  - `upheld` and `referred` count active decisions on those cases.
  - Sorted by `complaints desc, last_filed desc`, limit 50.

- [ ] **Step 1: Write the failing tests.**
  - Each test seeds its own unique office (`Analytics-${Date.now()}-${n}`) with `makeCase(…, { office, created_at, stage })`. Stage history is inserted with explicit `created_at` on `case_events` rows of type `stage_changed` and body `{from, to}`. Calls go through `adminClient().rpc(…)`.
  - Tests:
    - `overview counts filings, closures, median resolution and deadline compliance`: 3 cases in period (2 online, 1 walk-in, 1 `sw`). Two are closed after 10 and 20 days, giving `median_resolution_days = 15`. Two past deadlines, one met on time, give `deadlines_due = 2` and `deadlines_met = 1`. Expect `closed = 2` and `open_now = 1`.
    - `an empty office gives zeros and nulls, never an error`:
      - The overview gives `filed = 0` and `median_resolution_days = null`.
      - Stage times give 7 rows (received … decision) with `entered = 0` and `median_days = null`.
      - Officers, categories and repeat advocates give `[]`.
    - `stage times count every stay, including moves back`:
      - The history is received(day 0) → screening(day 2) → investigation(day 5) → hearing(day 9) → investigation(day 10) → hearing(day 14) → decision(day 15).
      - `investigation` has `entered = 2` and `median_days = 4` (stays of 4 and 4).
      - `hearing` has `entered = 2` and `median_days = 1` (stays of 1 and 1).
      - `screening` has `median_days = 3`.
    - `a reopened case uses its latest close`: closed at day 5, reopened at day 6, closed at day 30. `median_resolution_days = 30`, and the overview `closed = 1`.
    - `months are Nairobi months`: a case created `2026-03-31T22:30:00Z` falls in month `2026-04-01`.
    - `repeat advocates need p_min complaints and count upheld and referred decisions`:
      - Advocate A has 3 cases: one `refund_ordered`, one `referred_to_tribunal`, and one `dismissed` that was superseded by `admonished`.
      - Advocate B has 1 case.
      - With `p_min = 2`, only A appears, with `complaints = 3`, `upheld = 3` and `referred = 1`.
    - `officers show workload for active officers in the office`: officer O has 2 open cases and 1 closed in period, with one overdue stage deadline. Expect `open_now = 2`, `closed_in_period = 1` and `overdue_now = 1`.
    - `only service_role may call the functions`: `signInAs("complainant", …)` client `.rpc("analytics_overview", …)` returns an error.
- [ ] **Step 2: Run `npx vitest run tests/db/analytics.test.ts`.** Expected: FAIL (the functions don't exist).
- [ ] **Step 3: Write the migration.** Build the stays with a CTE: `select case_id, stage, entered_at, lead(entered_at) over (partition by case_id order by entered_at) as left_at` over the union of `(case_id, 'received', cases.created_at)` and `(case_id, body->>'to', created_at)` from `stage_changed` events. Durations are `extract(epoch from …)/86400`, rounded to 1 decimal.
- [ ] **Step 4: Apply the migration and run `npx vitest run tests/db/analytics.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(analytics): aggregate functions for resolution, stages, officers, categories and repeat advocates`.

### Task 2: Analytics service, period parsing and CSV

**Files:**
- Create:
  - `src/lib/csv.ts`: move `csvCell` out of `src/lib/admin/audit-query.ts` and re-use it there.
  - `src/lib/analytics/period.ts`
  - `src/lib/analytics/analytics.ts`
- Test: `tests/unit/analytics-period.test.ts`, `tests/unit/csv.test.ts`, `tests/db/analytics-service.test.ts`

**Interfaces:**
- **Consumes:** the Task 1 RPCs.
- **Produces, in `src/lib/csv.ts`:**
  - `csvCell(v: unknown): string`
  - `toCsv(head: string[], rows: unknown[][]): string`
  - The audit `toCsv(rows: AuditRow[])` keeps its signature and calls these.
- **Produces, in `src/lib/analytics/period.ts`:**
  - `type PeriodKey = "30d" | "90d" | "365d" | "custom"`
  - `interface Period { key: PeriodKey; from: Date; to: Date; fromDay: string; toDay: string }`: `fromDay` and `toDay` are inclusive Nairobi `YYYY-MM-DD` for display and inputs.
  - `parsePeriod(q: { period?: string; from?: string; to?: string }, now?: Date): Period`:
    - The default is `90d`, ending at the end of today in Nairobi.
    - `custom` needs valid `from <= to`, with a span of at most 3 years. Otherwise it falls back to the default.
    - `to` is exclusive: Nairobi midnight after `toDay`.
  - `periodQuery(p: Period): string`: the URL query string, used by links and the export.
- **Produces, in `src/lib/analytics/analytics.ts` (server-only):**
  - `interface AnalyticsReport { period: Period; office: string | null; overview: Overview; stages: StageRow[]; officers: OfficerRow[]; categories: CategoryRow[]; advocates: RepeatAdvocateRow[] }`. The row types mirror the RPC columns in camelCase, with numerics converted to `number | null`.
  - `analyticsAs(actor: StaffUser, period: Period, office: string | null): Promise<AnalyticsReport>`: throws `ForbiddenError` unless the role is commissioner or admin, and runs the 5 RPCs in parallel.
  - `ANALYTICS_SECTIONS = ["overview", "stages", "officers", "categories", "advocates"] as const`
  - `type AnalyticsSection`
  - `analyticsCsv(r: AnalyticsReport, s: AnalyticsSection): string`:
    - Overview is a key/value table.
    - The advocates CSV has no `advocate_id` column.
    - Every CSV's first line is `"# Mizani analytics: <section>, <fromDay> to <toDay>, office: <office|all>"`.
  - `officeOptions(): Promise<string[]>`: the distinct non-null `profiles.office` of active staff, sorted.

- [ ] **Step 1: Write the failing tests.**
  - `parsePeriod`, with `now = 2026-11-28T09:00:00Z`:
    - Default: `key "90d"`, `toDay "2026-11-28"`, `fromDay "2026-08-31"`, and `to = 2026-11-28T21:00:00Z` (Nairobi midnight).
    - `{period: "custom", from: "2026-01-01", to: "2026-01-31"}` gives `from = 2025-12-31T21:00:00Z`.
    - Invalid input falls back to the default: `from > to`, `"2026-13-45"`, a span over 3 years, and an unknown `period: "7y"`.
  - `csv`:
    - `csvCell("=HYPERLINK(1)")` is `"'=HYPERLINK(1)"` (in quotes).
    - Commas, quotes and newlines are quoted and quotes doubled.
    - `null` gives `""`.
    - `toCsv` uses CRLF line endings.
  - `analyticsAs`, a db test reusing Task 1 seeding:
    - An officer gets `ForbiddenError`.
    - A commissioner gets a report whose `overview.filed` matches the seeded office.
    - `analyticsCsv(report, "advocates")` contains the advocate's admission number and no UUID pattern.
- [ ] **Step 2: Run the three test files.** Expected: FAIL.
- [ ] **Step 3: Implement them.** Then run `npx vitest run tests/unit/audit-csv.test.ts` to confirm the audit CSV is unchanged.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(analytics): role-checked analytics service, Nairobi periods and safe CSV`.

### Task 3: Analytics dashboard and export

**Files:**
- Create:
  - `src/app/[locale]/commission/(app)/analytics/page.tsx`
  - `src/app/[locale]/commission/(app)/analytics/Filters.tsx` (client: a period select plus custom dates and office, submitted with GET)
  - `src/components/analytics/{StatTile,BarList,MonthlyColumns,DataTable}.tsx`
  - `src/app/api/analytics/export/route.ts`
- Modify:
  - `src/components/commission/CommissionNav.tsx`: add an "Analytics" link.
  - The commission dashboard: add a link card.
  - `messages/{en,sw}.json`: an `analytics.*` namespace and `commission.nav.analytics`.
- Test: `tests/e2e/analytics.spec.ts` (covers the page, the export route and both 403s)

**Interfaces:**
- **Consumes:** Task 2's `parsePeriod`, `periodQuery`, `analyticsAs`, `analyticsCsv`, `ANALYTICS_SECTIONS` and `officeOptions`.
- **The page:**
  - `requireStaff(locale, COMMISSION_ROLES)`, with `searchParams` `period`, `from`, `to` and `office`. An unknown office is treated as all offices.
  - It audits `view_analytics` and renders these sections, each with an `h2`, a chart, a `DataTable` and a "Download CSV" link to `/api/analytics/export?section=<s>&<periodQuery>&office=<o>`:
    1. **Overview tiles:**
       - Complaints filed, closed, open now.
       - Median days to resolve.
       - Deadlines met on time, as a % of due, or "—" when nothing is due.
       - Decisions, and refunds ordered (KES).
       - Online/walk-in split and Kiswahili share.
    2. **Where cases wait:** `BarList` of median days per stage, with open now and overdue now in the table. The stage with the highest `overdue_now`, then the highest `median_days`, gets a "Longest wait" badge.
    3. **Complaint trends:** `MonthlyColumns` of total filings per month, plus a table with one row per month and one column per category.
    4. **Officer workload:** table only. The caption reads "Workload depends on case mix; use this to balance work, not to rank officers."
    5. **Advocates with repeated complaints:** table only. Names link to `/staff?tab=all&q=<admission_no>`.
    6. **Decision outcomes:** `BarList` of `outcomes`, with labels from `commission.outcomes`.
  - Each section has an empty state using the message key `analytics.empty`.
- **Charts:**
  - `BarList({ items: {label: string; value: number | null; note?: string}[]; unit: string })`
  - `MonthlyColumns({ months: {month: string; value: number}[] })`
  - Both are server components, with SVG or CSS bars sized proportionally to the maximum. Values are printed as text next to the bars. `role="img"` and an `aria-label` summarise the chart, and the `DataTable` underneath carries the full values.
- **Export route:**
  - `GET /api/analytics/export`.
  - `assertStaff(COMMISSION_ROLES)`. Return 403 on `ForbiddenError`, and 400 for an unknown `section`.
  - Audit `export_analytics` with `{ section, period, office }`.
  - Response headers are `text/csv; charset=utf-8`, `Cache-Control: no-store` and `Content-Disposition: attachment; filename="mizani-<section>-<fromDay>-<toDay>.csv"`.

- [ ] **Step 1: Write the failing e2e test** `commissioner reads analytics, filters, exports; officers are refused`:
  - Seed via `adminClient` in a unique office: 3 cases with stage history and one decision.
  - `loginAsStaff(page, "commissioner")`, then open `/en/commission/analytics?period=365d&office=<office>`.
  - Expect headings "Where cases wait", "Complaint trends", "Officer workload", "Advocates with repeated complaints" and "Decision outcomes".
  - Expect the tile "Complaints filed" to show `3`.
  - Change the period select to "Last 30 days" and apply. The URL contains `period=30d`.
  - Download the stages CSV. The filename matches `/^mizani-stages-.*\.csv$/` and the content starts with `"# Mizani analytics: stages`.
  - An `audit_log` row exists with action `export_analytics` by the commissioner.
  - Open `?office=Nowhere-<stamp>`. Every section shows "No data for this period."
  - An officer context gets 403 on `/en/commission/analytics` and 403 on `/api/analytics/export?section=stages`. No `export_analytics` row exists for the officer.
- [ ] **Step 2: Run `npx playwright test tests/e2e/analytics.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Load the `dataviz` skill, then implement the page, components, route, nav links and en/sw messages.**
- [ ] **Step 4: Run the e2e test.** Expected: PASS. Then run `npx tsc --noEmit` and `npx eslint src`. Expected: clean.
- [ ] **Step 5: Commit** `feat(analytics): commissioner analytics dashboard with CSV export`.

### Task 4: Demo history for analytics

**Files:**
- Modify: `scripts/seed-demo.mts`
- Test: run the seed and the check query below.

**Interfaces:**
- **Consumes:** `ensureStaff`, `STAFF`, `COMMISSIONERS` (create commissioners if missing, so this flag works on its own) and `ensureComplainantForPhone`.
- **Produces:** a `--analytics-only` flag that adds **160 synthetic cases spread over the past 12 months**:
  - Seeded PRNG (mulberry32, seed `20261128`), so re-runs are identical.
  - Direct inserts with backdated `created_at` on `cases`, `stage_changed` events, `case_deadlines` (with `met_at`) and `decisions`. Services stamp `now()`, so they can't be used here.
  - Summary prefix `[History] `, `pin_hash` `"history-no-pin"`, complainants from 12 demo phones `+2547000096NN`, and offices Nairobi/Mombasa/Kisumu weighted 3:1:1.
  - Categories trend upward for `withheld_funds` in the last 4 months.
  - Two demo advocates appear in 7 and 5 cases respectively.
  - About 60% closed, with screening ~3 days, investigation ~25 days, hearing ~10 days, and about 20% of deadlines missed.
  - About 45 decisions with mixed outcomes, including refunds.
  - Idempotent: skip with `analytics history already seeded` if any `[History] %` case exists.
  - Prints `160 history cases created` and `<n> decisions recorded`. Demo logins print only when accounts are created (same rule as before).
- [ ] **Step 1: Run** `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts --analytics-only > <scratchpad>/analytics-seed.txt`. Expected: `160 history cases created`.
- [ ] **Step 2: Check.** Expected:
  - `select count(*) from cases where summary like '[History] %'` returns 160.
  - `select * from analytics_stage_times(now() - interval '365 days', now(), null)` has investigation `median_days` between 15 and 40.
  - A second run prints `analytics history already seeded`.
- [ ] **Step 3: Commit** `chore(seed): twelve months of synthetic history for analytics`.

### Task 5: Health endpoint, container build and handover pack

**Files:**
- Create:
  - `src/app/api/health/route.ts`
  - `Dockerfile`
  - `.dockerignore`
  - `docs/handover/README.md`, `self-hosting.md`, `operations.md`, `data-protection.md`, `security.md`, `user-guide.md`
- Modify:
  - `next.config.ts`: add `output: "standalone"`.
  - `README.md`: handover section, status, routes.
  - `docs/deploy.md`: link to the handover pack and drop the parts it supersedes.
- Test: `tests/db/health.test.ts`, `tests/unit/handover-docs.test.ts`

**Interfaces:**
- **`GET /api/health`:**
  - No auth, `Cache-Control: no-store`.
  - Body: `{ ok: boolean, db: "ok" | "error", sms: string, ai: string, version: string, time: string }`.
    - `db` comes from a `select 1`-style head count on `cases` with the admin client.
    - `sms` and `ai` are provider names only (`"fake"`, `"africastalking"`, `"claude"`, `"none"` …).
    - `version` comes from `package.json`.
  - Returns 200 when `db = "ok"` and 503 otherwise. No secrets, URLs or counts.
- **`Dockerfile`:**
  - Multi-stage on `node:24-alpine`: deps (`npm ci`), build (`npm run build`), then a runner that copies `.next/standalone`, `.next/static` and `public`.
  - Runs as a non-root `node` user with `PORT=3000` and `CMD ["node", "server.js"]`.
  - `NEXT_PUBLIC_*` values are build args, because they are inlined at build time. Server secrets come in only at runtime via `--env-file`.
- **`docs/handover/` contents:**
  - `README.md`: what Mizani is, the four portals, the architecture diagram (text), what lives where, and the reading order.
  - `self-hosting.md`:
    - Supabase self-hosted (Docker) on ACC servers or a Kenyan data centre.
    - Apply `supabase/migrations/*` in filename order.
    - Storage bucket `evidence`, auth settings (disable sign-ups; phone sign-in is app-issued).
    - App via the Docker image or `npm run build && node .next/standalone/server.js`, behind the ACC reverse proxy with TLS.
    - The hourly cron call to `/api/cron/deadlines` with `CRON_SECRET` (systemd timer or cron example).
    - The USSD callback URL.
    - **A table of every env var in `.env.example`:** purpose, required/optional, and secret yes/no.
  - `operations.md`:
    - First admin (`scripts/create-staff.mts`); creating, deactivating and resetting staff (MFA reset by an admin via Supabase auth); complainant PIN reset.
    - Workflow settings and routing rules.
    - Backups: nightly `pg_dump`, storage bucket copy, restore drill quarterly.
    - Monitoring with `/api/health`.
    - Secret rotation: the service key, AI key, Africa's Talking key, `CRON_SECRET`, `USSD_CALLBACK_SECRET`.
    - Upgrading: apply new migrations, then deploy the app.
    - Incident response, including the personal-data breach steps and the ODPC notification within 72 hours (DPA 2019 s.43).
  - `data-protection.md`:
    - The personal-data inventory: table → personal fields → purpose → who can read (RLS) → suggested retention.
    - The ACC decisions still open: retention periods, lawful basis, in-country processing (s.48–50 and the 2021 Regulations), the AI provider choice and data-transfer agreement.
    - A DPIA checklist and ODPC registration steps.
    - How redaction works before AI, and how to switch AI off.
    - Data-subject requests: access via the case record and audit log; correction via staff.
    - It states clearly that automatic deletion is not implemented and that the ACC must set retention first.
  - `security.md`:
    - A role × capability matrix (complainant, advocate, officer, admin, commissioner).
    - RLS and the service-role pattern, MFA, the append-only audit log, the read audit, rate limits (status PIN, activation, OTP).
    - Where the secrets live, and the known limits that remain (from the plan ledgers' deferred items).
  - `user-guide.md`: short task-based guides per role.
    - Complainant and advocate sections in English **and** Kiswahili.
    - Staff, admin and commissioner sections in English.
    - Covers how to file, track, respond, run intake, triage, notify, schedule, decide and read analytics.

- [ ] **Step 1: Write the failing tests.**
  - `health`: call `GET()` from the route module. Expect status 200, `body.db = "ok"` and `body.ok = true`, and expect that `JSON.stringify(body)` contains neither `process.env.SUPABASE_SERVICE_ROLE_KEY` nor `process.env.NEXT_PUBLIC_SUPABASE_URL`.
  - `handover-docs`:
    - Every file listed above exists and is non-empty.
    - Every relative Markdown link in `docs/handover/*.md` and `README.md` resolves to an existing file.
    - Every variable name in `.env.example` appears in `docs/handover/self-hosting.md`.
    - `user-guide.md` contains the headings `## Mlalamikaji` and `## Wakili`.
- [ ] **Step 2: Run the two tests.** Expected: FAIL.
- [ ] **Step 3: Implement** the route, the Dockerfile, `.dockerignore` (excluding `.env*`, `.next`, `node_modules`, `tests`, `.superpowers`, `test-results`), `output: "standalone"`, and the docs.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `npm run build`. Expected: OK, and `.next/standalone/server.js` exists. If Docker is running, also run `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=… --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=… -t mizani:test .`. Expected: success. Record the outcome in the ledger either way.
- [ ] **Step 5: Commit** `docs: ACC handover pack, health endpoint and container build`.

### Task 6: Finish

**Files:**
- Modify: `README.md` (Plan 6 marked done, analytics routes added).

- [ ] **Step 1: Run the full suite:** `npm test && npm run test:e2e && npm run build`. Expected: all pass.
- [ ] **Step 2: Commit** `docs: Plan 6 complete`.

## Left out of this plan (explicit)

- Public statistics or a public register of decisions. Publication rules are the ACC's call; the CSV export supports producing them by hand.
- Automatic data deletion. Retention periods must be set by the ACC first; `data-protection.md` says how they would be enforced.
- Scheduled e-mailed reports, and forecasting.
- A data warehouse or BI-tool connector. The CSV and the SQL functions are the integration points.
