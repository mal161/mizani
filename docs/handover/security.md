# Security model

## Roles and what they can do

| Capability | Complainant | Advocate | Officer (`staff`) | Admin | Commissioner |
|---|---|---|---|---|---|
| File a complaint, upload evidence | own | — | walk-in intake | walk-in intake | — |
| See a case | own cases | cases served on them | all cases | all cases | all cases (read-only in staff workspace) |
| See internal notes, minutes, AI output | no | no | yes | yes | yes |
| See complainant contact details | own | **never** | yes | yes | yes |
| Respond to the complaint | — | yes, within the deadline (late is marked) | — | — | — |
| Triage, assign, change stage, notes, information requests | — | — | yes | yes | no |
| Notify the advocate, share evidence with them | — | — | yes | yes | no |
| Schedule / reschedule / adjourn / cancel hearings, track referrals | — | — | yes | yes | no |
| Record minutes and decisions | — | — | no | yes | yes, for hearings on their panel |
| Analytics and analytics CSV | — | — | no | yes | yes |
| Accounts, workflow settings, routing rules, audit log | — | — | no | yes | no |

## How it is enforced

- **In the database:** row-level security on every table. Complainants read cases only through the `my_cases` view (no PIN hash, no internal fields); advocates only through `advocate_cases` (cases where they were formally notified, without the complainant's contact details); staff data is visible only to sessions that passed the authenticator step (`aal2`) and whose account is active. Browsers have **no write permission** on any table.
- **In the app:** every change goes through a server action that checks the role, then a service function (`…As(actor, …)`) that checks it again, writes with the server-only service key, records a timeline event and an audit row. Sensitive multi-step writes (recording a decision, consuming a login code) run in one database transaction.
- **Staff sign-in:** email + password, then an authenticator app (TOTP). Without the second step the database shows no staff data.
- **Complainants and advocates:** SMS one-time codes issued by the app (bcrypt-hashed, single use). Advocates first activate with admission number + the activation code printed on the notice letter + their roll phone.
- **Audit:** every case view, document download, status check, USSD lookup, export and change is written to `audit_log`; database triggers record row changes with before/after values. The table rejects updates, deletes and truncation, including from administrators.
- **Files:** evidence lives in a private bucket; downloads go through a permission check and a 60-second signed link.
- **AI:** redaction before any call; output stored separately and applied only by a person. See [data-protection.md](data-protection.md#what-ai-receives).

## Rate limits

| What | Limit |
|---|---|
| Status check by case number + PIN | locks after 5 wrong PINs per caller per case per hour (30 per case overall) |
| SMS login codes | 3 per phone per 10 minutes, 8 per phone per day, 10 per caller per hour; each code works once |
| Advocate activation | 5 wrong attempts per advocate; 10 activation requests per caller per hour |

## Secrets

All secrets are environment variables on the app server (listed in [self-hosting.md](self-hosting.md#environment-variables)); none are in the repository or the browser bundle. The service role key bypasses row-level security, so it must never leave the server. Rotation steps: [operations.md](operations.md#rotating-secrets).

## Known limits

Deliberately left for the ACC to prioritise after handover:

- No in-app reset of a complainant's status PIN (complainants with a phone can sign in by SMS instead).
- No automatic deletion: retention periods must be set first ([data-protection.md](data-protection.md)).
- Scanned evidence images are not read for AI summaries (no OCR).
- Hearing minutes can be recorded before the hearing's start time; a very long venue name can push a hearing SMS past one 160-character message.
- No calendar invitations or video-conference integration for hearings; the online link is typed in by staff.
- Mizani does not send email; notice letters are printed or sent from the ACC's own mail system.
