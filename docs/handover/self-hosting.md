# Self-hosting Mizani in Kenya

Target: everything on ACC-controlled infrastructure (ACC servers or a Kenyan data centre), so that complaint data stays in Kenya. You need two things running: **Supabase** (database, sign-in, file storage) and the **Mizani app** (Next.js). Both run in Docker.

## 1. Supabase (self-hosted)

1. Follow Supabase's self-hosting guide (Docker Compose) on a Linux server. Set strong values for the Postgres password, `JWT_SECRET`, `ANON_KEY` and `SERVICE_ROLE_KEY` it asks for, and put it behind TLS.
2. Apply the schema: run every file in `supabase/migrations/` **in filename order** against the database, e.g.

   ```sh
   for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```

   The migrations create every table, view, row-level-security policy, database function and the private Storage bucket `evidence`.
3. Auth settings (Studio → Authentication):
   - **Turn off "Allow new users to sign up".** Complainants and advocates sign in with SMS codes that the app issues itself; staff accounts are created by an administrator. Nobody should be able to sign up directly.
   - Leave email confirmations off (staff accounts are created confirmed by the app).
   - Phone sign-in through Supabase is not used (the app sends its own codes through Africa's Talking).
4. Keep the Postgres port closed to the internet; only the app server needs to reach the Supabase API.

## 2. The app

### Option A — Docker (recommended)

```sh
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.acc.example \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
  -t mizani:1 .
docker run -d --name mizani --restart unless-stopped \
  --env-file /etc/mizani/mizani.env -p 127.0.0.1:3000:3000 mizani:1
```

The two `NEXT_PUBLIC_*` values are compiled into the browser code, so they are build arguments; rebuild the image if they change. Every other variable is read at runtime from the env file (permissions `600`, owned by root). The image runs as a non-root user and has a health check on `/api/health`.

### Option B — Node directly

On a server with Node 24: `npm ci && npm run build`, then run `node .next/standalone/server.js` under systemd with the same environment (copy `.next/static` to `.next/standalone/.next/static` and `public` to `.next/standalone/public` first, as the Dockerfile does).

### Reverse proxy

Put nginx (or the ACC's existing proxy) in front, terminate TLS there and forward to `127.0.0.1:3000`. Allow request bodies of at least **55 MB** (complaints carry up to 5 files of 10 MB): `client_max_body_size 55m;`.

## 3. Scheduled job: deadline alerts

Call the deadline job **every hour**:

```sh
# /etc/cron.d/mizani
0 * * * * root curl -fsS -H "Authorization: Bearer $(cat /etc/mizani/cron_secret)" https://mizani.acc.example/api/cron/deadlines >/dev/null
```

The token must equal `CRON_SECRET`.

## 4. SMS and USSD (Africa's Talking)

Use an ACC-owned Africa's Talking account with a dedicated short code or alphanumeric sender ID. Set `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY` and `AT_SENDER_ID` (without it, messages go out from Africa's Talking's default sender). For USSD, set the service callback URL to `https://mizani.acc.example/api/ussd?key=<USSD_CALLBACK_SECRET>`.

## 5. First administrator

With the env file loaded on any machine that can reach Supabase:

```sh
npx tsx scripts/create-staff.mts <email> admin <office> "<Full Name>"
```

It prints the account's password once (it stays valid: the app has no password-change page, so keep it private or set a new one in Supabase Studio). The administrator sets up their authenticator app at first sign-in and creates every other account in **Administration → Staff accounts**.

## 6. The advocates roll

A fresh install has an empty `advocates` table; the demo roll in `supabase/seed.sql` is synthetic and must not be loaded. Advocates must be on the roll before officers can match them when sending a notice, and before they can activate their accounts (admission number + roll phone). Import the Law Society of Kenya roll as a CSV with the columns `admission_no` (unique), `full_name`, `phone` (international format, `+2547…`) and `firm` (optional): Supabase Studio → Table editor → `advocates` → Insert → Import data from CSV, or `\copy advocates (admission_no, full_name, phone, firm) from 'roll.csv' csv header` in `psql`. When the roll changes, insert new advocates and update changed phones or firms by admission number (e.g. `insert … on conflict (admission_no) do update set phone = excluded.phone, firm = excluded.firm`); never delete rows that cases already point to.

## Environment variables

| Variable | Purpose | Required | Secret |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Address of the Supabase API | yes (build arg) | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (anon) key; all access is still limited by row-level security | yes (build arg) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used after the app has checked the user's role | yes | **yes** |
| `SMS_PROVIDER` | `africastalking` in production; `fake` only for development (codes printed to the log) | yes | no |
| `AT_USERNAME` | Africa's Talking username (`sandbox` for testing) | with Africa's Talking | no |
| `AT_API_KEY` | Africa's Talking API key | with Africa's Talking | **yes** |
| `AT_SENDER_ID` | The ACC's registered short code or sender ID shown to recipients | recommended with Africa's Talking | no |
| `USSD_CALLBACK_SECRET` | Shared secret in the USSD callback URL | with USSD | **yes** |
| `CRON_SECRET` | Bearer token for `/api/cron/deadlines` | yes | **yes** |
| `AI_PROVIDER` | `none` (AI off), `claude`, `openrouter`, `openai-compatible` (e.g. a model hosted in Kenya) or `fake` (demo) | no (default `none`) | no |
| `AI_MODEL` | Model name for the chosen provider | for `openrouter` / `openai-compatible` | no |
| `ANTHROPIC_API_KEY` | Key for `AI_PROVIDER=claude` | with `claude` | **yes** |
| `AI_API_KEY` | Key for `openrouter` or an `openai-compatible` server that needs one | with those | **yes** |
| `AI_BASE_URL` | Base URL of an `openai-compatible` server | with `openai-compatible` | no |
| `OPENROUTER_PROVIDERS` | Comma-separated list pinning which OpenRouter hosts may serve requests | no | no |

`OTP_TEST_CODE` exists for automated tests only. It is ignored when `SMS_PROVIDER=africastalking` or `NODE_ENV=production`; **never set it on a server**.

## 7. Check the installation

- `curl https://mizani.acc.example/api/health` → `{"ok":true,"db":"ok", ...}` with the expected `sms` and `ai` provider names.
- File a test complaint at `/sw/my/file`, check it at `/sw/status`, then delete the test data.
- Sign in as the administrator and open **Administration → Audit log**: the test filing and views must be there.
