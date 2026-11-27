# Mizani — handover pack for the Advocates Complaints Commission

This pack is for the ACC team that will run Mizani after the hackathon: ICT staff who host and maintain it, the data protection officer, and the people who manage users. Everything in the hackathon deployment is synthetic demo data.

## What Mizani is

One case management system for complaints against advocates, with four portals on one database:

| Portal | Who | Address |
|---|---|---|
| Complainant | members of the public (English / Kiswahili) | `/en`, `/sw`, `/[locale]/my/...`, status check at `/[locale]/status`, USSD |
| Advocate | the advocate complained against | `/[locale]/advocate` (activated with the code on the notice letter) |
| Staff | intake staff, investigating officers, administrators | `/[locale]/staff` (password + authenticator app) |
| Commission | commissioners (and administrators) | `/[locale]/commission`, including analytics |

Each case has one number, one timeline of everything that happened, deadlines, documents and an audit trail that nobody, including administrators, can change.

## How it fits together

```
 Browser / phone ──HTTPS──> Next.js app (Node 24) ──> Supabase: Postgres + Auth + Storage
                                │                        (row-level security on every table,
 Feature phone ──USSD/SMS──> Africa's Talking ──callback──┘  append-only audit_log)
                                │
                                └──(optional, redacted text only)──> AI provider (Claude, OpenRouter,
                                                                       or a model hosted in Kenya)
```

- **Code:** this repository. App code in `src/`, database schema in `supabase/migrations/` (applied in filename order), scripts in `scripts/`, tests in `tests/`.
- **Data:** all records live in Postgres; uploaded evidence lives in the private Storage bucket `evidence`.
- **Secrets:** only in environment variables on the server (see [self-hosting.md](self-hosting.md#environment-variables)); never in the repository.

## Reading order

1. [self-hosting.md](self-hosting.md) — install Mizani on ACC servers or a Kenyan data centre.
2. [operations.md](operations.md) — day-to-day running: accounts, backups, monitoring, upgrades, incidents.
3. [data-protection.md](data-protection.md) — what personal data is held, the decisions the ACC must take, DPIA and ODPC registration.
4. [security.md](security.md) — who can see and do what, and how that is enforced.
5. [user-guide.md](user-guide.md) — short task guides for each kind of user (complainant and advocate guides in English and Kiswahili).

The project [README](../../README.md) lists every route and the developer commands; [deploy.md](../deploy.md) covers the hosted hackathon demo (Vercel + Supabase).
