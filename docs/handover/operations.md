# Operations runbook

Day-to-day running of Mizani once it is installed (see [self-hosting.md](self-hosting.md)).

## People and accounts

| Task | How |
|---|---|
| First administrator | `npx tsx scripts/create-staff.mts <email> admin <office> "<Full Name>"` (prints the account's password once) |
| Create officer / commissioner / admin | **Administration → Staff accounts → Create**. The app shows the new account's password once; give it to the person in person. It stays valid: the app has no password-change page, so whoever saw it knows it until an admin sets a new one in Supabase Studio. The person sets up an authenticator app at first sign-in, which protects the account even if the password is known. |
| Change someone's role | **Administration → Staff accounts** (role list). Takes effect on their next page load. |
| Someone leaves | **Administration → Staff accounts → Deactivate**. Deactivated staff are signed out of every staff page immediately (the database checks `active` on every query). Reassign their open cases from the workspace. |
| Lost phone / authenticator | Remove their factor so they enrol again at next sign-in: in Supabase SQL, `delete from auth.mfa_factors where user_id = '<their id>';` Confirm identity in person first, and note it in the incident log. |
| Forgotten staff password | Supabase Studio → Authentication → Users → the user → set a new password, and hand it over in person. (E-mailed reset links have no page to land on in the app.) |
| Complainant forgot their PIN | If the case has a phone number they can sign in with an SMS code at `/[locale]/login` and see the case without the PIN. An in-app PIN reset is not built yet (see [security.md](security.md#known-limits)). |
| Advocate lost the activation code | Issue a fresh notice from the Advocate panel on the staff case page; a new notice replaces the old code. |

## Workflow settings

**Administration → Workflow settings**: stage names (English and Kiswahili), stage deadlines (SLAs), the advocate response window (default 14 days), whether conciliation is used, and the *Use AI assistance* switch. **Administration → Routing rules**: which office/officer receives new complaints by category and priority. Changes apply to new deadlines and new cases; they are recorded in the audit log.

## Backups

- **Database:** nightly `pg_dump --format=custom` of the Supabase Postgres database, encrypted, copied off the server; keep 30 daily and 12 monthly copies.
- **Evidence files:** nightly copy of the Storage bucket `evidence` (the Supabase storage volume, or `rclone` against the Storage S3 endpoint).
- **Configuration:** the env file and reverse-proxy config, stored in the ACC's secret store, not in the backup of the app server.
- **Restore drill:** every quarter, restore the latest backup to a test server, open three random cases and download one document from each. Record the date and result.

## Monitoring

- `GET /api/health` every minute from the ACC's monitoring tool. Alert when the status is not 200 or `db` is not `"ok"`. The response holds no personal data.
- Undelivered SMS appear as "SMS could not be sent" entries on the case timeline (`case_events` rows of type `sms_failed`); check for them weekly, e.g. `select count(*) from case_events where type = 'sms_failed' and created_at > now() - interval '7 days';`. Watch the app's own output for repeated 5xx errors.
- The hourly deadline job writes alerts to staff; if officers stop receiving "deadline within 48 hours" alerts, check the cron entry and `CRON_SECRET`.

## Rotating secrets

Rotate at handover, then at least yearly and immediately after any suspected leak:

| Secret | Where to change it | Then |
|---|---|---|
| Supabase service role key / JWT secret | Supabase config | update the app env file, restart the app |
| `AT_API_KEY` | Africa's Talking dashboard | update env file, restart |
| `ANTHROPIC_API_KEY` / `AI_API_KEY` | provider console | update env file, restart |
| `CRON_SECRET` | generate a new random value | update env file **and** the cron entry |
| `USSD_CALLBACK_SECRET` | generate a new random value | update env file **and** the USSD callback URL at Africa's Talking |

## Upgrading

1. Back up the database.
2. Apply any new files in `supabase/migrations/` (in filename order) — always **before** deploying the new app version.
3. Build and deploy the new image; check `/api/health`.
4. Run the smoke test from [self-hosting.md](self-hosting.md#7-check-the-installation).

## Incidents and personal-data breaches

1. Contain: deactivate affected accounts, rotate the exposed secrets, take the affected service offline if needed.
2. Investigate with **Administration → Audit log** (filter by user, case or date, export CSV). Every case view, document download, status check, export and change is recorded and cannot be edited.
3. A breach of personal data must be notified to the **Data Protection Commissioner within 72 hours** of becoming aware of it (Data Protection Act, 2019, s.43), and to the affected people where there is a real risk of harm. The data protection officer leads this.
4. Write up what happened, what data and how many people were affected, and what was changed to prevent it again.
