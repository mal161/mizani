# Mizani — Case Management System for the Advocates Complaints Commission

Date: 2026-11-25
Context: KISP × GDSAI 2026 Hackathon ("Accountability & Justice Rebooted"). Submission deadline 11 Dec 2026.

## 1. Intent and why

Build an AI-powered, end-to-end Case Management System (CMS) for Kenya's Advocates Complaints Commission (ACC). The winning system is expected to be inherited by the ACC, so Mizani must be a real, deployable product — not a demo — that the ACC could run on day one and host itself later.

A "case" is one complaint against an advocate, tracked from intake to closure, with every communication, document, deadline, action and decision held in one chronological record.

## 2. Goals

1. **Centralized record keeping** — each case has a unique case number and a single chronological timeline: complaint, advocate response, emails, call logs, uploaded documents, internal notes, hearings, status changes, decisions.
2. **Workflow automation & routing** — rules assign cases to officers by complaint category, priority and current workload; deadline alerts (e.g. advocate response window, hearing dates) fire automatically.
3. **Compliance & audit trail** — every view, edit and decision is logged with timestamp and user ID in an append-only log that application users (including admins) cannot alter.
4. **Collaboration & handoffs** — intake → investigating officer → commissioners → Disciplinary Tribunal referral, each stage with full context.
5. **Reporting & analytics** — resolution times, bottleneck stages, officer workload/performance, complaint-category trends, repeat-advocate patterns.
6. **AI assistance** — classify and summarize incoming complaints, score urgency, flag duplicates and repeat advocates, summarize long case files. AI suggests; humans decide.

## 3. Users and portals (all four, each with its own portal, one shared system)

| Portal | Users | Core capabilities |
|---|---|---|
| Complainant | Members of the public | File complaint (details, advocate, evidence), receive case number, track status, respond to information requests, see outcome |
| Advocate | Advocate complained against | Get notified, view allegations, submit response + documents within deadline, follow case |
| Staff | ACC intake staff, investigating officers, admins | Queue, assigned cases, full timeline, notes, assisted (walk-in) intake, scheduling, deadlines, AI summaries; admin: users, roles, routing rules, categories, SLA settings |
| Commissioner | ACC commissioners | Cases ready for hearing/decision, hearing calendar, case bundles, record decisions, referrals to Disciplinary Tribunal, analytics dashboard |

Visibility is role-based and enforced in the database (row-level security). Examples: complainants and advocates never see internal notes; each party sees only their own cases; officers see assigned cases plus the queue.

**Identity (proposed):**
- Complainants: phone number + one-time SMS code (email optional).
- Advocates: account linked to an advocate record, matched against the Law Society of Kenya roll (admission number). For the hackathon, the roll is a seeded/imported dataset; account activation requires admission number + phone/email match.
- Staff/commissioners: email + password with MFA, created by an admin.

## 4. Intake channels

- **Online** via the complainant portal.
- **Walk-in (assisted intake)** — staff file on the complainant's behalf, scan paper documents, print a slip with the case number and send it by SMS. Record shows who captured it and at which office.
- **SMS/USSD for status checks** — dial a short code, enter case number + PIN, get current status. Automated SMS at key events (received, advocate responded, hearing scheduled, decision issued).
- Provider: **Africa's Talking** (sandbox for hackathon demo).

## 5. Languages

English and Swahili across complainant/advocate portals, SMS and USSD. Staff/commissioner portals English-first with Swahili available. AI must handle English, Swahili and code-mixed text (incl. Sheng); original text always shown alongside AI output.

## 6. Case lifecycle (proposed, configurable by admin)

Received → Screening (admissibility / jurisdiction; may be closed as inadmissible) → Advocate notified (response window, default 14 days) → Investigation → Conciliation (optional) → Hearing → Decision → Closed, with "Referred to Disciplinary Tribunal" as a decision outcome. Any stage can request more information from either party. Stage names, SLAs and allowed transitions are admin-configurable since the ACC's exact internal procedure is not confirmed; defaults follow the Advocates Act (Cap. 16).

## 7. Constraints

- 16 days to submission. Entire scope is in.
- Build priority (most critical first, so later items can be partial if time runs short): (1) complainant filing & tracking, (2) staff workspace incl. assisted intake, routing, timeline, audit, (3) AI triage & summaries, (4) advocate notification & response, (5) commissioner hearings/decisions, (6) analytics. SMS/USSD and Swahili are woven through each slice, not left to the end.
- Hackathon hosting: hosted Vercel + Supabase + Claude API with synthetic demo data only (no real complainant data). A handover document describes migrating to ACC-owned infrastructure in Kenya (self-hosted Supabase, Next.js on ACC servers, and a decision on AI provider/data-transfer under the DPA).
- Kenya Data Protection Act 2019: minimize personal data, role-based access, audit, ability to self-host in Kenya.
- AI calls must not send raw PII off-system: names, ID numbers, phone numbers, emails are redacted before text goes to the model.
- Must run for judges on free tiers / sandboxes.

## 8. Approaches considered

- **A. Next.js + Supabase (chosen).** One web app for all four portals; Supabase for Postgres, auth, storage, row-level security; deployed on Vercel. Fastest to build; permissions enforced in DB; Supabase is open source so ACC can self-host in Kenya later. Trade-off: two hosted services during hackathon.
- **B. Django + PostgreSQL + React.** Familiar to government IT, built-in admin, strong Python AI. Rejected: two codebases and more manual auth/permission work — too slow for 16 days at the needed polish.
- Dropped: Java/Spring (too slow), low-code platforms (not cleanly handed over).

## 9. Decided parts of the how

- Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage, RLS) + Vercel.
- Claude API for AI features, behind a PII-redaction layer.
- **Pluggable AI provider:** all AI calls go through a single provider adapter interface, so ACC can swap Claude for a self-hosted open model in Kenya or another provider under a data-transfer agreement, via configuration, without code changes elsewhere.
- **AI is optional:** a global switch disables AI; every workflow (triage, routing, summaries) still works manually. AI output is always labelled as AI-generated and stored separately from human-entered records.
- Kenya DPA 2019 (s.48–50, 2021 Regulations) handover note: ACC must confirm whether its processing falls under in-country requirements, run a DPIA, and register with the ODPC before using any external AI on real data.
- Africa's Talking for SMS and USSD.
- Append-only audit log table (insert-only, enforced by DB policies/triggers).
- Bilingual i18n (en, sw).

## 10. Anti-goals

- AI making or recommending disciplinary decisions — it assists triage and summarization only.
- Any party seeing data they shouldn't (a single leak of internal notes or another complainant's data is a failure even if everything else works).
- A pretty demo that can't actually be operated or handed over.

## 11. Implementation decisions

- **Redaction:** regex/rule-based redaction of names (of parties on file), ID numbers, phone numbers, emails in free text before any AI call. Advocate and complainant names replaced with stable placeholders (e.g. `[ADVOCATE_A17]`) so repeat-advocate detection still works — repeat detection itself runs on IDs in the database, not in the AI. Uploaded documents: text extracted (OCR for scans) and run through the same redaction before AI summarization; raw files never go to the AI.
- **Workflow configurability:** fixed set of stages (section 6) in code; admins can rename stages, change SLAs, enable/disable optional stages (e.g. Conciliation) and edit routing rules. No adding brand-new stages at runtime.
- **Notifying advocates without accounts:** advocate contacts come from the seeded LSK roll; on notification the system sends SMS/email and generates a formal notice letter (PDF). The response clock starts from the recorded date of service, set by staff. The notice contains an activation code to claim the advocate account.
- **Advocate visibility:** sees the allegations, the complainant's name, and evidence explicitly shared by the officer. Never sees the complainant's contact details or internal notes. File storage access follows the same rules.
- **Status PIN:** 6-digit PIN generated at filing, shown once online or printed on the walk-in slip, and sent by SMS when a phone exists. Staff can reset it after an identity check. USSD lookups are rate-limited.
- **Audit of reads:** all case-record reads by any user (portal views, document downloads, USSD/SMS lookups) are logged at the application layer. Writes are additionally logged by DB triggers. The audit table is insert-only.

## 12. Left to the builder

UI component library and visual design, exact schema, routing-rule engine design, notification scheduling mechanism, analytics charts, test strategy, seed/demo data, deployment details.
