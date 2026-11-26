# Data protection pack

For the ACC's data protection officer. Mizani was built with the Data Protection Act, 2019 and the Data Protection (General) Regulations, 2021 in mind, but **compliance is the ACC's responsibility as data controller**. This pack lists what the system holds and the decisions the ACC still has to take before loading real complaints.

## Decisions the ACC must take first

1. **Registration:** register with the Office of the Data Protection Commissioner (ODPC) as a data controller (and processor, if applicable).
2. **DPIA:** complete a Data Protection Impact Assessment before go-live. Complaints can contain sensitive personal data (health, family and financial details) about complainants and third parties. Checklist below.
3. **Where data lives:** confirm whether the processing must be kept in Kenya (s.48–50 and the 2021 Regulations). If so, self-host as in [self-hosting.md](self-hosting.md); the hackathon demo runs on hosted services outside Kenya and must not receive real data.
4. **AI provider:** choose one of
   - `AI_PROVIDER=none` or *Use AI assistance* switched off — nothing leaves the system;
   - a model hosted in Kenya (`openai-compatible`);
   - an external provider (`claude`, or `openrouter` pinned with `OPENROUTER_PROVIDERS`) under a data-transfer agreement, treated as a cross-border transfer.
5. **Retention periods** for each kind of record (table below). Mizani does **not** delete anything automatically yet; once the ACC sets periods, a scheduled deletion job can be added per table.
6. **Lawful basis and notices:** confirm the lawful basis (statutory function under the Advocates Act) and publish a privacy notice; the filing form records the complainant's consent to data processing.
7. **Rotate every key** used during the hackathon and remove all demo data before go-live.

## What AI receives

Only text, after `src/lib/ai/redact.ts` replaces phone numbers, emails, national ID, KRA PIN and passport numbers and the two parties' names with placeholders. Files are never sent; text-layer PDFs are read on the server and redacted; scanned images are not read. Redaction does **not** catch: names of other people (witnesses, relatives, judges, clerks), land parcel and bank account numbers, and addresses written in free text. Record this in the DPIA. AI output is stored separately (`ai_outputs`), labelled *AI-generated*, never shown to complainants or advocates, never included in case bundles, and only used when an officer clicks **Apply suggestion**.

## Personal-data inventory

| Table / store | Personal data | Purpose | Who can read it (enforced by row-level security) | Suggested retention (ACC to decide) |
|---|---|---|---|---|
| `auth.users`, `profiles` | name, phone, email (staff), role, office | sign-in, contact, attribution | the person; staff (MFA) | while the account is active + 1 year |
| `cases` | complainant link, advocate named, complaint text, language, channel, office, PIN hash | the complaint itself | complainant (own case, no internal fields); notified advocate (allegations only); staff | closure + the ACC's records-retention period |
| `case_events` | timeline: notes, information requests and replies, stage changes, decisions | case history | parties see only events marked for them; internal notes staff only | with the case |
| `documents` + Storage `evidence` | uploaded evidence files | evidence | complainant (own, non-internal); advocate (only files shared with them); staff | with the case |
| `advocates` | roll data: name, admission number, phone, firm | identifying and contacting the advocate | staff; the advocate (own entry) | while on the roll |
| `advocate_responses` | the advocate's written response | case record | the advocate (own); staff — never the complainant | with the case |
| `hearings` | date, venue, online link, panel, **minutes** | hearings | staff and commissioners; parties see date/place/link only, never minutes | with the case |
| `decisions`, `referrals` | outcome, reasons, orders, amount; tribunal reference | decisions | staff; parties see the published decision | with the case (decisions are often kept longer) |
| `ai_outputs` | AI suggestions and summaries (derived from redacted text) | triage assistance | staff only | 1 year or with the case |
| `notifications` | which staff member was alerted about which case | staff alerts | the staff member | 90 days |
| `login_codes`, `status_attempts`, `activation_requests`, `advocate_activations` | phone, caller address, hashed codes, attempt counts | sign-in, rate limiting | server only | 30 days |
| `audit_log` | who viewed or changed what, when, from which channel | accountability | administrators | at least as long as the case records |

Analytics (`/commission/analytics`) only produces totals and medians; it never returns complainant details. Advocate and officer names appear in its tables, for commissioners and administrators only.

## DPIA checklist

- [ ] Describe the processing: intake channels (online, walk-in, SMS/USSD), who uses which portal, data flows (above inventory).
- [ ] Necessity and proportionality: which fields are required, which are optional (phone is optional for walk-in complainants).
- [ ] Risks to people: wrongful disclosure to the advocate or the public; disclosure of third-party information in complaint text; AI transfer; insider misuse.
- [ ] Measures: row-level security, MFA for staff, append-only audit log of reads and writes, redaction before AI, private evidence storage with 60-second links, rate limits on PIN, login and activation codes (see [security.md](security.md)).
- [ ] Hosting location and any cross-border transfer (AI provider, SMS provider).
- [ ] Retention periods per table (above) and how deletion will be done.
- [ ] How data-subject requests will be handled (below).
- [ ] Sign-off by the DPO and the accounting officer; review yearly.

## Data-subject requests

- **Access:** staff can print or export the case record (case page; the case bundle PDF) and the audit log rows about a person (**Administration → Audit log**, filter by user or case, CSV).
- **Correction:** officers correct case details through the case page; each change is recorded with before/after values.
- **Objection / deletion:** decided case by case against the ACC's statutory duty to keep complaint records; there is no self-service deletion.
