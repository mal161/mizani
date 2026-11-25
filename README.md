# Mizani

AI-powered case management system for Kenya's **Advocates Complaints Commission (ACC)**, built for the KISP × GDSAI 2026 Hackathon ("Accountability & Justice Rebooted").

Mizani tracks each complaint against an advocate from intake to closure: one case number, one timeline holding every communication, document, deadline and decision, and an audit log that cannot be edited.

> **Demo data only.** Every advocate, complainant and case in this project is made up. Do not load real personal data until the ACC has completed the steps in `docs/deploy.md` → *Data protection*.

## Status

| Part | State |
|---|---|
| Plan 1 — foundation + complainant portal (filing, tracking, web/USSD status, EN/SW) | done |
| Plan 2 — staff workspace (MFA sign-in, queues, walk-in intake, routing, deadlines, admin, audit viewer) | done |
| Plan 3 — AI triage (swappable provider, PII redaction, on/off switch) | next |
| Plan 4 — advocate portal | planned |
| Plan 5 — commissioner portal (hearings, decisions, tribunal referrals) | planned |
| Plan 6 — analytics + ACC handover pack | planned |

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

To create a real staff account: `npx tsx scripts/create-staff.mts <email> <staff|admin|commissioner> <office> "<Full Name>"` (prints a one-time temporary password; the person sets up their authenticator at first sign-in). After the first admin exists, create others from **Administration → Staff accounts**.

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
| `GET /api/cron/deadlines` | Vercel Cron | hourly deadline alerts (`Authorization: Bearer $CRON_SECRET`) |
| `GET /api/documents/[id]` | parties | audited evidence download |

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
