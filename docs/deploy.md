# Deploying Mizani

## Hackathon demo (hosted)

Hosting: Vercel (app) + Supabase (database, auth, storage). Demo data only.

### 1. Supabase

1. Create a project (region closest to Kenya available on your plan).
2. Apply `supabase/migrations/*.sql` in filename order, then `supabase/seed.sql`.
3. Note the project URL, anon key and service_role key (Project Settings → API).

### 2. Vercel

1. Import the Git repository into Vercel (framework: Next.js; defaults are fine).
2. Set environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
| `SMS_PROVIDER` | `africastalking` for real SMS, `fake` otherwise |
| `AT_USERNAME` | `sandbox` for the Africa's Talking sandbox |
| `AT_API_KEY` | Africa's Talking API key |
| `USSD_CALLBACK_SECRET` | random string; append `?key=<it>` to the USSD callback URL |
| `AI_PROVIDER` | `claude`, `fake` (demo without a key) or `none` |
| `ANTHROPIC_API_KEY` | Anthropic API key, only when `AI_PROVIDER=claude` (secret) |
| `AI_MODEL` | optional model override (default `claude-opus-5-5`) |
| `CRON_SECRET` | random string; Vercel Cron sends it to `/api/cron/deadlines` (scheduled hourly in `vercel.json`) |

Do **not** set `OTP_TEST_CODE` on a public deployment.

3. In Supabase → Authentication, keep **multi-factor (TOTP)** enabled and **turn off "Allow new users to sign up"** (all accounts are created by the app or an admin).
4. Create the first admin: `npx tsx scripts/create-staff.mts <email> admin <office> "<Full Name>"` with `.env.local` pointing at the project. They set up their authenticator at first sign-in, then create other staff in the app.
5. Deploy. Smoke test: file a complaint at `/sw/my/file`, then check it at `/sw/status` — expected stage "Imepokelewa".

### 3. Africa's Talking (sandbox)

1. Create an account at africastalking.com and open the Sandbox app; copy the API key.
2. USSD → create a service code; set the callback URL to `https://<your-vercel-domain>/api/ussd?key=<USSD_CALLBACK_SECRET>`.
3. Open the Sandbox simulator, register a test phone number, dial the service code: choose a language, enter the case number digits (e.g. `2026000123`), then the PIN.
4. SMS sent in sandbox mode appear in the simulator, not on real phones.

## Handover to the ACC (production)

Mizani is built so the ACC can run it on its own infrastructure in Kenya.

- **Database/auth/storage:** Supabase is open source; self-host it (Docker) on ACC servers or a Kenyan data centre, then apply the same migrations.
- **App:** `npm run build && npm start` on any Node 24 host, or a container behind the ACC's reverse proxy.
- **SMS/USSD:** an ACC-owned Africa's Talking account with a dedicated short code.

### Data protection (before any real data)

Under the Data Protection Act, 2019 and the 2021 Regulations, the ACC should, before processing real complaints:

1. Register with the Office of the Data Protection Commissioner as a data controller.
2. Complete a Data Protection Impact Assessment (complaints can contain sensitive personal data).
3. Confirm whether its processing must be kept in Kenya (s.50 and the Regulations); if so, self-host as above.
4. Decide on the AI provider: implement `AiProvider` (`src/lib/ai/provider.ts`) for a self-hosted model in Kenya or a provider under a data-transfer agreement, or set `AI_PROVIDER=none` / switch *Use AI assistance* off. Redaction reduces but does not remove identifiability (the facts of a complaint can still identify people), so treat any external AI provider as a cross-border transfer under the Act. Record in the DPIA what redaction does **not** catch: names of people other than the two parties (witnesses, relatives, judges, clerks), land parcel and bank account numbers, and addresses written in free text or in PDF evidence. Only the parties' names and the phone numbers, emails, ID, KRA PIN and passport numbers listed in the README are removed.
5. Rotate every key used during the hackathon and remove all demo data.
