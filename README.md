# Mizani

AI-powered case management system for Kenya's **Advocates Complaints Commission (ACC)**, built for the KISP × GDSAI 2026 Hackathon ("Accountability & Justice Rebooted").

Mizani tracks each complaint against an advocate from intake to closure: one case number, one timeline holding every communication, document, deadline and decision, and an audit log that cannot be edited.

> **Demo data only.** Every advocate, complainant and case in this project is made up. Do not load real personal data until the ACC has completed the steps in `docs/deploy.md` → *Data protection*.

## Status

| Part | State |
|---|---|
| Plan 1 — foundation + complainant portal (filing, tracking, web/USSD status, EN/SW) | done |
| Plan 2 — staff workspace (walk-in intake, routing, deadlines, admin) | next |
| Plan 3 — AI triage (swappable provider, PII redaction, on/off switch) | planned |
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

### Demo sign-in

With `SMS_PROVIDER=fake`, the login code appears in the server console. For automated tests, `OTP_TEST_CODE=123456` makes every code `123456`. **Never set `OTP_TEST_CODE` on a deployment with real SMS.**

## Tests

```
npm test            # unit + database tests (needs .env.local pointing at a dev Supabase project)
npm run test:e2e    # browser tests (starts the dev server on :3100)
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

## Security model (summary)

- Row-level security on every table; complainants read cases only through the `my_cases` view (no PIN hash, no internal fields).
- Internal notes (`visibility = 'internal'`) never reach complainants.
- Evidence lives in a private bucket; downloads use 60-second signed links issued after a permission check.
- Every write to case data is logged by database triggers; every case view and status check is logged by the app. The audit table rejects updates, deletes and truncation.
- Status PINs and login codes are stored only as bcrypt hashes; status checks lock after 5 wrong PINs per case per hour.
