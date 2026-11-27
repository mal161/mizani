# Mizani

AI-powered case management system for Kenya's **Advocates Complaints Commission (ACC)**, built for the KISP × GDSAI 2026 Hackathon ("Accountability & Justice Rebooted").

Mizani tracks each complaint against an advocate from intake to closure: one case number, one timeline holding every communication, document, deadline and decision, and an audit log that cannot be edited.

> **Demo data only.** Every advocate, complainant and case in this project is made up. Do not load real personal data until the ACC has completed the steps in `docs/deploy.md` → *Data protection*.

## Status

| Part | State |
|---|---|
| Plan 1 — foundation + complainant portal (filing, tracking, web/USSD status, EN/SW) | done |
| Plan 2 — staff workspace (MFA sign-in, queues, walk-in intake, routing, deadlines, admin, audit viewer) | done |
| Plan 3 — AI triage (swappable provider, PII redaction, on/off switch) | done |
| Plan 4 — advocate portal (formal notice + letter, activation, response) | done |
| Plan 5 — commissioner portal (hearings, decisions, tribunal referrals) | done |
| Plan 6 — analytics + ACC handover pack | done |

Design: [`docs/superpowers/specs/2026-11-25-mizani-design.md`](docs/superpowers/specs/2026-11-25-mizani-design.md)

## Stack

Next.js 15 (App Router, TypeScript) · Supabase (Postgres + row-level security, Auth, Storage) · next-intl (English / Kiswahili) · Africa's Talking (SMS, USSD) · Vitest · Playwright

## Run it locally

1. Install Node 24, then `npm install` and `npx playwright install chromium`.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase dashboard → Project Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` — same page. **Secret: server only, never commit.**
   - `SMS_PROVIDER=fake` prints SMS to the server console instead of sending.
3. Apply the database: run every file in `supabase/migrations/` in order, then `supabase/seed.sql` (Supabase SQL editor, or `npx supabase db push` with a linked project).
4. `npm run dev` → http://localhost:3000

### Demo data and staff accounts

`SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts` creates (synthetic) one admin, three officers (Nairobi, Mombasa, Kisumu) with authenticator apps pre-enrolled, and 25 cases across all stages. It prints each login and TOTP secret once — add the secret to an authenticator app ("enter a setup key"). Re-running skips existing demo accounts.

To create a real staff account: `npx tsx scripts/create-staff.mts <email> <staff|admin|commissioner> <office> "<Full Name>"` (prints the password once; it stays valid because the app has no password-change page, so hand it over in person. The person sets up their authenticator at first sign-in). After the first admin exists, create others from **Administration → Staff accounts**.

### Complainant demo sign-in

With `SMS_PROVIDER=fake`, the login code appears in the server console. For automated tests, `OTP_TEST_CODE=123456` makes every code `123456`. **Never set `OTP_TEST_CODE` on a deployment with real SMS.**

## Tests

```
npm test            # unit + database tests (needs .env.local pointing at a dev Supabase project)
npm run test:e2e    # browser tests (starts the dev server on :3100, one worker)
```

Database tests create test users and cases in the configured project. Use a development project, never production.

## Main routes

| Route | Who | What |
|---|---|---|
| `/en`, `/sw` | everyone | home, language switch |
| `/[locale]/login` | complainants | phone number + SMS code |
| `/[locale]/my/file` | complainants | file a complaint with evidence |
| `/[locale]/my/cases` | complainants | list and detail of own cases |
| `/[locale]/status` | anyone | status by case number + PIN |
| `POST /api/ussd` | Africa's Talking | USSD status menu |
| `/[locale]/staff/login` | staff | email + password, then authenticator code |
| `/[locale]/staff` | staff | queues: my cases, unassigned, overdue, all |
| `/[locale]/staff/cases/[case]` | staff | timeline, notes, stage, triage, assignment, info requests |
| `/[locale]/staff/intake` | officers | walk-in filing with printable slip |
| `/[locale]/staff/admin` | admins | staff accounts, workflow settings, routing rules, audit log + CSV |
| `GET /api/cron/deadlines` | Vercel Cron | deadline alerts (`Authorization: Bearer $CRON_SECRET`): daily at 08:00 Nairobi on the Vercel Hobby plan, hourly when self-hosted or on Pro |
| `GET /api/documents/[id]` | parties | audited evidence download |
| `/[locale]/advocate/activate` | advocates | claim an account with the admission number + activation code from the notice |
| `/[locale]/advocate` | advocates | complaints served on them, allegations, shared evidence, response form |
| `POST /api/cases/[id]/notice` | officers | record service, issue activation code, return the notice letter PDF |
| `/[locale]/commission` | commissioners, admins | my upcoming hearings, cases awaiting decision, recent decisions |
| `/[locale]/commission/hearings` | commissioners, admins | week-by-week agenda of every panel (own panels highlighted) |
| `/[locale]/commission/cases/[case]` | commissioners, admins | case record, bundle download, hearing minutes, decision form |
| `GET /api/cases/[id]/bundle` | staff roles | audited case bundle PDF (cover, contents, complaint, responses, history, hearings, exhibits) |
| `GET /api/decisions/[id]/letter` | staff roles, the complainant, the notified advocate | audited decision letter PDF (English + Kiswahili) |
| `GET /api/referrals/[id]/pack` | staff roles | audited tribunal referral pack (decision letter + case bundle) |
| `/[locale]/commission/analytics` | commissioners, admins | resolution times, where cases wait, trends, officer workload, repeat advocates, outcomes; period + office filters |
| `GET /api/analytics/export?section=…` | commissioners, admins | audited CSV of one analytics section (aggregates only) |
| `GET /api/health` | monitoring | database reachable; provider names and version only with `Authorization: Bearer $CRON_SECRET` (no secrets, no data) |

## Advocate portal

- **Notice:** on the staff case page, the officer links the case to the advocate on the roll, ticks which documents to share, records how and when the notice was served, and downloads the notice letter (PDF, English + Kiswahili). The letter carries a one-time activation code; only its hash is stored. The advocate's roll phone also gets an SMS.
- **Deadline:** date of service + the advocate response window (Administration → Workflow settings, default 14 days). Late responses are accepted and marked late.
- **Activation:** the advocate enters admission number + activation code + their mobile number, then the SMS code. Afterwards they sign in at `/login` with that phone, like complainants; the login sends them to the advocate portal.
- **What advocates see:** the allegations, the complainant's name, the documents the officer shared, their own responses and uploads, and the parts of the timeline marked for them. Never the complainant's phone or other contact details, internal notes, AI output, flags or unshared evidence.
- **What complainants see:** that the advocate responded, never the response text or the advocate's documents.
- **Demo:** `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts --advocates-only` adds two demo advocates (phones `+254700009901`, `+254700009902`) with six notified cases.

## Commissioner portal

- **Roles:** officers schedule, reschedule, adjourn and cancel hearings from the staff case page and track tribunal referrals. Commissioners sign in like staff (password + authenticator) and land on `/commission`; they record minutes and decisions for hearings on their panel. Admins can do both. Commissioners can still read the staff workspace but cannot change cases there.
- **Hearings:** date and time (Nairobi), length, in person (venue) or online (https link), and a panel of 1–5 commissioners. Mizani warns when a panel member is already booked at an overlapping time; the officer can schedule anyway. Scheduling moves the case to the hearing stage, alerts the panel in Mizani and texts both parties (the online link is shown only in their portals, not in the SMS).
- **Minutes** are internal: they appear in the case bundle and the commission portal, never on the complainant's or advocate's pages.
- **Decisions:** outcome (dismissed, withdrawn, settled, advocate admonished, refund ordered with an amount in KES, referred to the Disciplinary Tribunal), reasons (at least 50 characters), optional orders, and the panel. Recording a decision moves the case to the decision stage, publishes the outcome, reasons, orders and amount to both parties and texts them. A correction replaces the published decision and keeps the earlier one on record (`superseded_by`); both parties are told it was corrected.
- **Documents:** the case bundle (confidential, includes internal notes and minutes, never AI output), the decision letter, and for tribunal referrals a referral pack (letter + bundle). Every download is audited.
- **Referrals:** a tribunal decision opens a referral (prepared → lodged → acknowledged → concluded) with the tribunal's reference number, kept by officers.
- **Demo:** `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts --commission-only > private-logins.txt` adds two demo commissioners (authenticator apps pre-enrolled), four upcoming hearings (one online) and three decided cases (a KES 65,000 refund, a tribunal referral and an admonishment). Keep the output file private: it holds passwords and TOTP secrets.

## Analytics

`/commission/analytics` (commissioners and admins): complaints filed, closed and open; median days to resolve; deadlines met on time; where cases wait (median and 90th-percentile days per stage, open and overdue now); monthly complaint trends by category; officer workload; advocates with repeated complaints (and how many were upheld or referred); decision outcomes and refunds ordered. Filter by period (30/90/365 days or custom dates, Africa/Nairobi) and office; overview, stages, trends, workload and advocates download as CSV (outcomes are in the overview CSV). Figures are computed in the database (`analytics_*` functions) and only aggregates leave it: no complainant details. Views and exports are audited. Demo history: `SMS_PROVIDER=fake npx tsx scripts/seed-demo.mts --analytics-only > private-logins.txt` adds 160 synthetic cases over the past 12 months.

## Handover to the ACC

The handover pack is in [`docs/handover/`](docs/handover/README.md): [self-hosting in Kenya](docs/handover/self-hosting.md) (Docker image, migrations, env vars, cron, USSD), [operations runbook](docs/handover/operations.md), [data protection pack](docs/handover/data-protection.md) (data inventory, DPIA checklist, ODPC, AI provider decision), [security model](docs/handover/security.md) and [user guides](docs/handover/user-guide.md) (complainant and advocate guides in English and Kiswahili). Build the production image with `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=… --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=… -t mizani .`.

## AI assistance

- **What it does:** suggests a category, priority, urgency reasons and an English + Kiswahili summary for each new complaint, and summarises a whole case file on request. Staff see it labelled *AI-generated* and click **Apply suggestion** to use it; AI never changes a case on its own. Complainants never see AI output.
- **What is sent:** only text, after `src/lib/ai/redact.ts` replaces phone numbers, emails, ID numbers, KRA PINs, passport numbers and the parties' names with placeholders. Files are never sent; text-layer PDFs are read locally and redacted. Scanned documents are read by [soma-OCR](https://github.com/mal161/soma-OCR) (open-source, self-hosted) and their text is used only at 60% OCR confidence or more.
- **Providers** (`AI_PROVIDER`):
  - `claude`: Anthropic API, model `claude-opus-5-5` unless `AI_MODEL` is set; needs `ANTHROPIC_API_KEY`; refusals fall back server-side.
  - `openrouter`: any model on OpenRouter with one key; needs `AI_API_KEY` and `AI_MODEL` (e.g. `anthropic/…`, `google/…`, `meta-llama/…`). Requests ask OpenRouter to use only hosts that don't store or train on prompts; `OPENROUTER_PROVIDERS=HostA,HostB` pins the hosts (e.g. those covered by a data-transfer agreement).
  - `openai-compatible`: any server with an OpenAI-style `/chat/completions` API, e.g. a self-hosted model in Kenya (vLLM, Ollama); needs `AI_BASE_URL` and `AI_MODEL`, plus `AI_API_KEY` if the server wants one.
  - `fake`: deterministic stand-in for development and demos, no network. `none` (default): AI off.
  - Answers are always checked against the same JSON schema; a model that returns something else just shows "AI suggestion unavailable". Compare models with the eval below before choosing one. Add a different kind of provider by implementing `AiProvider` in `src/lib/ai/provider.ts`.
- **Switch:** Administration → Workflow settings → *Use AI assistance*. Off means nothing is sent anywhere and staff triage by hand.
- **Flags** (no AI): possible duplicates (same complainant and advocate within 90 days) and the advocate's complaint history.
- **Eval:** `npx tsx scripts/eval-triage.mts --provider fake` checks the plumbing for free; `--provider claude --yes` (or `openrouter` / `openai-compatible`) measures a real model on 30 synthetic complaints (English, Kiswahili, Sheng) and costs a little API credit.

## Security model (summary)

- Row-level security on every table; complainants read cases only through the `my_cases` view (no PIN hash, no internal fields).
- Internal notes (`visibility = 'internal'`) never reach complainants.
- Evidence lives in a private bucket; downloads use 60-second signed links issued after a permission check.
- Every write to case data is logged by database triggers; every case view and status check is logged by the app. The audit table rejects updates, deletes and truncation.
- Status PINs and login codes are stored only as bcrypt hashes; status checks lock after 5 wrong PINs per caller per case per hour (30 per case overall).
- Staff must pass an authenticator-app (TOTP) step; the database only shows staff data to sessions at MFA level `aal2`.
- Staff never write tables directly: every change goes through a server action that checks the role, then a service that records a timeline event and the audit log.

## Development note

If the project folder is synced by OneDrive (or similar), the dev server's `.next` folder can be corrupted mid-write (symptoms: `ENOENT ... rename` warnings and `Unexpected ... JSON` errors on every page). Delete `.next` and restart, and preferably keep the repository outside synced folders.
