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
| `AI_PROVIDER` | `claude`, `openrouter`, `openai-compatible`, `fake` (demo without a key) or `none` |
| `ANTHROPIC_API_KEY` | Anthropic API key, only when `AI_PROVIDER=claude` (secret) |
| `AI_API_KEY` | key for `openrouter` / `openai-compatible` (secret) |
| `AI_MODEL` | model id; optional for `claude` (default `claude-opus-5-5`), required otherwise |
| `AI_BASE_URL` | server URL for `openai-compatible`, e.g. `http://10.0.0.5:8000/v1` |
| `OPENROUTER_PROVIDERS` | optional comma list of OpenRouter hosts to allow |
| `HEARING_VIDEO_BASE_URL` | optional; https address of the Jitsi server for hearing rooms Mizani creates (default `https://meet.jit.si`) |
| `CRON_SECRET` | random string; Vercel Cron sends it to `/api/cron/deadlines` (scheduled daily at 05:00 UTC = 08:00 Nairobi in `vercel.json`, because the Hobby plan allows one run a day; on Pro, change the schedule to `0 * * * *` for hourly alerts) |

Do **not** set `OTP_TEST_CODE` on a public deployment.

3. In Supabase → Authentication, keep **multi-factor (TOTP)** enabled and **turn off "Allow new users to sign up"** (all accounts are created by the app or an admin).
4. Create the first admin: `npx tsx scripts/create-staff.mts <email> admin <office> "<Full Name>"` with `.env.local` pointing at the project. They set up their authenticator at first sign-in, then create other staff in the app.
5. Deploy. Smoke test: file a complaint at `/sw/my/file`, then check it at `/sw/status` — expected stage "Imepokelewa".

### Serving notices on advocates

Mizani does not send email. Officers download the notice letter PDF from the case page and serve it by hand, courier or post (or attach it to an email from the ACC's own mail system), then record the method and date of service, which starts the advocate's response deadline. The advocate's roll phone also receives an SMS. Each new notice for a case replaces the earlier activation code. Keep the advocates roll (`advocates` table) current: the roll phone receives the SMS and the admission number is part of activation.

### Hearings, decisions and referral packs

- **Hearing notices** go out by SMS to both parties (complainant in their language, advocate in English) and as in-app alerts to the panel. Mizani does not send calendar invitations. For an online hearing, officers either paste a link from the ACC's own video service (Zoom, Teams, Google Meet…) or leave the link blank, and Mizani creates a Jitsi video room for that hearing. Parties and the panel see the link in their portals; it is never sent by SMS.
- **Video rooms:** by default rooms are on the public `https://meet.jit.si` (free, no account or API key). Room names are `ACC-Hearing-` plus 16 random characters, with no case number or names. On meet.jit.si the first person to join (the panel chair) is asked to sign in with a Google, GitHub or Facebook account to open the room. For production, the ACC should run its own Jitsi server (open source, can be hosted in Kenya, allows recording on its own storage) and set `HEARING_VIDEO_BASE_URL` to its address, e.g. `https://video.acc.go.ke`. Changing it affects only hearings scheduled afterwards.
- **Decision letters** (English + Kiswahili) are generated on demand from the stored decision and can be downloaded by staff, the complainant and the notified advocate. Print and serve them through the ACC's usual channels if a signed copy is needed.
- **Referral packs** (decision letter + full case bundle) are for lodging with the Disciplinary Tribunal. Bundles contain internal notes and hearing minutes: share them only with the Tribunal.
- **Retention:** hearings, minutes, decisions (including superseded ones) and referrals are part of the case record and follow the same retention period as the case (see *Data protection*). Generated PDFs are not stored; each download is rebuilt from the record and logged in the audit log.

### 3. Africa's Talking (sandbox)

1. Create an account at africastalking.com and open the Sandbox app; copy the API key.
2. USSD → create a service code; set the callback URL to `https://<your-vercel-domain>/api/ussd?key=<USSD_CALLBACK_SECRET>`.
3. Open the Sandbox simulator, register a test phone number, dial the service code: choose a language, enter the case number digits (e.g. `2026000123`), then the PIN.
4. SMS sent in sandbox mode appear in the simulator, not on real phones.

## Handover to the ACC (production)

Mizani is built so the ACC can run it on its own infrastructure in Kenya. The full handover pack is in [handover/](handover/README.md): [self-hosting](handover/self-hosting.md) (Docker image, migrations, environment variables, cron, USSD), [operations](handover/operations.md), [data protection](handover/data-protection.md), [security](handover/security.md) and [user guides](handover/user-guide.md). In short:

- **Database/auth/storage:** Supabase is open source; self-host it (Docker) on ACC servers or a Kenyan data centre, then apply the same migrations.
- **App:** the repository's `Dockerfile` builds a self-contained image (Next.js standalone output) to run behind the ACC's reverse proxy.
- **SMS/USSD:** an ACC-owned Africa's Talking account with a dedicated short code.

### Data protection (before any real data)

Under the Data Protection Act, 2019 and the 2021 Regulations, the ACC should, before processing real complaints:

1. Register with the Office of the Data Protection Commissioner as a data controller.
2. Complete a Data Protection Impact Assessment (complaints can contain sensitive personal data).
3. Confirm whether its processing must be kept in Kenya (s.50 and the Regulations); if so, self-host as above.
4. Decide on the AI provider: a self-hosted model in Kenya (`AI_PROVIDER=openai-compatible`), a provider under a data-transfer agreement (`claude`, or `openrouter` pinned with `OPENROUTER_PROVIDERS`), or `AI_PROVIDER=none` / switch *Use AI assistance* off. With OpenRouter, text is forwarded to the host serving the chosen model; list those hosts in the DPIA. Redaction reduces but does not remove identifiability (the facts of a complaint can still identify people), so treat any external AI provider as a cross-border transfer under the Act. Record in the DPIA what redaction does **not** catch: names of people other than the two parties (witnesses, relatives, judges, clerks), land parcel and bank account numbers, and addresses written in free text or in PDF evidence. Only the parties' names and the phone numbers, emails, ID, KRA PIN and passport numbers listed in the README are removed.
5. Rotate every key used during the hackathon and remove all demo data.
