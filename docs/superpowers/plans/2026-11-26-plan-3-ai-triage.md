# Plan 3 — AI Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new complaint gets an AI triage suggestion (category, priority, urgency reasons, short English and Swahili summary) and staff can ask for an AI summary of a whole case file — always from redacted text, always labelled as AI, never applied without a human, and switchable off entirely — plus database-driven duplicate and repeat-advocate flags.

**Architecture:** One `AiProvider` interface with three implementations: `claude` (Anthropic SDK, structured outputs), `fake` (deterministic, for tests and demos without a key) and `none`. All AI calls go through `src/lib/ai/*`: redact → call provider → validate → store in `ai_outputs` (separate from human records) → audit. Duplicate and repeat-advocate flags are plain SQL on IDs, not AI. A global `ai_enabled` setting plus `AI_PROVIDER` env decide whether anything is sent.

**Tech Stack:** as Plans 1–2, plus `@anthropic-ai/sdk` (structured outputs via `client.messages.parse` + `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`), `unpdf` (local PDF text extraction).

**Spec:** `docs/superpowers/specs/2026-11-25-mizani-design.md` (§2 goal 6, §9 pluggable provider / AI optional / DPA note, §11 redaction calls)

## Global Constraints

- All Plan 1–2 constraints hold (strict TS, en/sw key parity, no client write grants, staff writes via `*As(actor, …)` behind `assertStaff`, every change audited with the actor).
- **No raw personal data leaves the system.** Text sent to any provider passes `redact()` first. Raw files are never sent; only text extracted locally, then redacted.
- **AI suggests, humans decide.** AI output never changes `cases.category`, `priority`, `stage` or assignment by itself; staff click "Apply" (which calls the existing `setCategoryPriorityAs`).
- **AI is optional.** `ai_enabled = false` (settings) or `AI_PROVIDER=none` → no provider call, no error, UI shows "AI is switched off"; every workflow still works manually.
- AI output is stored only in `ai_outputs`, always rendered with a visible "AI-generated" label and the original text alongside.
- Model: `claude-opus-5-5` (`AI_MODEL` env override). Triage uses `output_config.effort: "low"`; case summaries `"medium"`. `max_tokens`: triage 2000, summary 4000.
- Each provider call is audited: action `ai_triage` / `ai_summary`, details `{provider, model, redactions: <count per kind>, ok}` — never the prompt or output text.
- `ANTHROPIC_API_KEY` is server-only; never in client bundles or logs.
- Tests never call the real API: `AI_PROVIDER=fake` in vitest/playwright; the Claude provider is tested with an injected fake SDK client.
- Commits carry no co-author trailer.

## Review Focus

1. A complaint that mentions the complainant's own phone, email, ID number and the advocate's name → none of those strings appear in the text handed to the provider. (Test in Task 1 and Task 3.)
2. Admin switches AI off → filing still succeeds, no provider call is made, the staff page says AI is off. (Test in Task 3 and Task 6.)
3. The provider returns a category that isn't in the configured list, malformed output, a refusal, or times out → filing still succeeds, the case shows "AI suggestion unavailable", nothing is stored as a suggestion. (Test in Task 2 and Task 3.)
4. A complainant must never see AI output or flags. (Test in Task 6.)
5. "Apply suggestion" by a commissioner (read-only role) → refused. (Test in Task 6.)

---

### Task 1: Redaction

**Files:**
- Create: `src/lib/ai/redact.ts`
- Test: `tests/unit/redact.test.ts`

**Interfaces:**
- Produces `interface KnownParty { name: string; placeholder: string }` and
  `redact(text: string, parties: KnownParty[]): { text: string; counts: Record<RedactionKind, number> }`,
  `type RedactionKind = "phone" | "email" | "national_id" | "kra_pin" | "passport" | "party_name"`.
- Rules (applied in this order, case-insensitive where letters are involved):
  - emails → `[EMAIL]`
  - Kenyan phones in any common form (`+254 7xx…`, `07xx…`, `01xx…`, with spaces/dashes) → `[PHONE]`
  - KRA PIN `[AP]\d{9}[A-Z]` → `[KRA_PIN]`
  - passport `[A-Z]{1,2}\d{6,8}` when preceded by "passport" within 20 chars → `[PASSPORT]`
  - national ID: standalone 7–8 digit numbers → `[ID_NUMBER]` (but not amounts written with `KES`/`Ksh`/commas, and not years)
  - each known party's full name, and each name part of ≥3 letters, → its placeholder (e.g. `[COMPLAINANT]`, `[ADVOCATE]`), longest first, whole words only
- Pure function; no I/O.

- [ ] **Step 1: Failing tests:** each kind redacted with counts; `"KES 50,000"` and `"in 2024"` untouched; a Swahili sentence `"Wakili Baraka Kiprono alichukua pesa zangu, nipigie 0712 345 678"` with parties `[{name:"Baraka Kiprono", placeholder:"[ADVOCATE]"}]` → `"Wakili [ADVOCATE] alichukua pesa zangu, nipigie [PHONE]"`; "Barakaville" not touched by the name "Baraka"; empty text → empty text, zero counts.
- [ ] **Step 2:** `npx vitest run tests/unit/redact.test.ts` → FAIL. **Step 3:** implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(ai): personal-data redaction`.

### Task 2: Provider adapter, settings and storage

**Files:**
- Create: `supabase/migrations/20261127000001_ai.sql`, `src/lib/ai/schemas.ts`, `src/lib/ai/provider.ts`, `src/lib/ai/claude.ts`, `src/lib/ai/fake.ts`, `src/lib/ai/index.ts`, `src/lib/ai/prompts.ts`
- Modify: `.env.example` (`AI_PROVIDER=fake`, `AI_MODEL=`, `ANTHROPIC_API_KEY=`), `src/lib/cases/workflow-config.ts` (+`aiEnabled: boolean`, default true, from `ai_enabled`)
- Test: `tests/unit/ai-provider.test.ts`

**Interfaces:**
- Table `ai_outputs(id uuid pk, case_id → cases on delete cascade, kind text check in ('triage','case_summary'), provider text, model text, status text check in ('ok','unavailable'), output jsonb, error text null, created_by uuid null, created_at)`; RLS on, staff SELECT via `staff_role()`, no client writes; index `(case_id, kind, created_at desc)`.
- `schemas.ts` (zod): `triageSchema = { category: string, priority: enum low|normal|high|urgent, urgency_reasons: string[] (≤5, each ≤200), summary_en: string ≤600, summary_sw: string ≤600, language: enum en|sw|mixed }`; `caseSummarySchema = { summary_en: string ≤2000, summary_sw: string ≤2000, key_dates: {date: string, event: string}[] ≤10, open_questions: string[] ≤5 }`.
- `provider.ts`: `interface AiProvider { name: string; model: string; triage(i: TriageInput): Promise<AiResult<Triage>>; summarizeCase(i: SummaryInput): Promise<AiResult<CaseSummary>> }`; `type AiResult<T> = { ok: true; value: T } | { ok: false; reason: "refused" | "invalid_output" | "error" }`; `TriageInput = { text: string; categories: string[] }`; `SummaryInput = { complaint: string; timeline: string }` (both already redacted).
- `claude.ts`: `class ClaudeProvider implements AiProvider` — constructor takes an optional client (for tests). Uses `client.messages.parse({ model, max_tokens, system, messages, output_config: { effort, format: zodOutputFormat(schema) } })`. `stop_reason === "refusal"` → `{ok:false, reason:"refused"}`; `parsed_output === null` → `invalid_output`; thrown SDK error → `error` (logged with status only). 30 s timeout, `maxRetries: 2`. Ruling to record if adopted: whether the SDK's `beta.messages.parse` supports the server-side refusal `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`); use it if it does, otherwise handle refusal as above.
- `prompts.ts`: system prompts (fixed strings, no dates/ids, cache-stable): triage — Kenyan ACC context, redaction placeholders explained, choose `category` only from the given list (`other` if unsure), priority rubric (urgent = ongoing harm/imminent deadline/vulnerable person; high = money withheld/deadline missed; normal; low), never decide guilt, write neutral summaries in both languages, input may be English, Swahili or Sheng; summary — neutral case-file summary for an officer.
- `fake.ts`: `class FakeAiProvider` — deterministic: category = first category whose name (underscores → spaces) appears in the text, else `other`; priority `high` if text contains "money|pesa|KES", else `normal`; summaries = first 120 chars; records calls in `calls: { kind, input }[]`; `failNext(reason)` makes the next call fail.
- `index.ts`: `getAiProvider(): AiProvider | null` from `AI_PROVIDER` (`claude` | `fake` | `none`, default `none`; `claude` without `ANTHROPIC_API_KEY` → null with one warning log). Fake is a process singleton (like SMS).

- [ ] **Step 1: Failing tests:** fake provider determinism and `failNext`; Claude provider with an injected stub client: valid parse → ok; `stop_reason:"refusal"` → refused; `parsed_output:null` → invalid_output; stub throws → error; request uses model `claude-opus-5-5`, effort `low` for triage, and the system prompt contains no digits from a timestamp; `getAiProvider()` honours each env value; `parseWorkflowConfig` reads `ai_enabled`.
- [ ] **Step 2–4:** FAIL → `npm i @anthropic-ai/sdk unpdf`, implement, apply migration → PASS (`npx vitest run tests/unit`).
- [ ] **Step 5:** Commit `feat(ai): pluggable provider with Claude and fake implementations`.

### Task 3: Triage on filing

**Files:**
- Create: `src/lib/ai/triage.ts`
- Modify: `src/lib/cases/after-filing.ts` (call `triageCase` after routing; failures recorded, never thrown)
- Test: `tests/db/ai-triage.test.ts`

**Interfaces:**
- `triageCase(caseId: string, actor?: StaffUser): Promise<{ status: "ok" | "unavailable" | "disabled" }>`:
  1. `cfg.aiEnabled === false` or `getAiProvider() === null` → `disabled` (nothing stored, no audit).
  2. Load case + complainant name + advocate name (roll name or `advocate_name_given`); `redact(summary + "\n\n" + description, [{complainant, "[COMPLAINANT]"}, {advocate, "[ADVOCATE]"}])`.
  3. `provider.triage({ text, categories: cfg.categories })`; a returned category not in `cfg.categories` → treated as `invalid_output`.
  4. Insert `ai_outputs` row (`status ok` with output, or `unavailable` with `error` reason); audit `ai_triage` with `{provider, model, redactions, ok}`, actor = `actor` or system.
- `latestAi(caseId, kind)` helper for pages.

- [ ] **Step 1: Failing tests (AI_PROVIDER=fake):** filing a complaint whose description contains the complainant's phone, email and ID number and the advocate's name → one `ai_outputs` triage row `status ok`; the fake's recorded input contains none of those strings and contains `[PHONE]`, `[EMAIL]`, `[ID_NUMBER]`, `[ADVOCATE]`; audit row has redaction counts and no text. With `ai_enabled=false` (restore afterwards) → no row, no fake call, filing succeeds. `failNext("refused")` → row `status unavailable`, filing succeeds. Fake returning an unknown category → `unavailable`. `cases.category` is still null after triage.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(ai): automatic triage suggestion on filing`.

### Task 4: Duplicate and repeat-advocate flags (no AI)

**Files:**
- Create: `supabase/migrations/20261127000002_case_flags.sql`, `src/lib/cases/flags.ts`
- Test: `tests/db/flags.test.ts`

**Interfaces:**
- SQL function `case_flags(p_case_id uuid) returns jsonb` (security definer, service role only): `{ possible_duplicates: [{case_number, created_at}] }` = other cases by the same complainant against the same advocate (same `advocate_id`, or same lower-cased `advocate_name_given` when no roll match) filed within 90 days; `advocate_history: { total, open, last_12_months, closed }` for the same `advocate_id` (null when unmatched).
- `caseFlags(caseId: string): Promise<CaseFlags>` (typed wrapper).

- [ ] **Step 1: Failing tests:** two cases by one complainant against one roll advocate 10 days apart → second shows the first as a possible duplicate; a case 120 days apart → not; three cases from different complainants against one advocate → `total 3`; unmatched advocate → `advocate_history null`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: duplicate and repeat-advocate flags`.

### Task 5: Case-file summary and document text

**Files:**
- Create: `src/lib/ai/document-text.ts`, `src/lib/ai/summarize.ts`
- Test: `tests/unit/document-text.test.ts`, `tests/db/ai-summary.test.ts`, fixture `tests/fixtures/receipt.pdf` (generated synthetic text PDF)

**Interfaces:**
- `extractPdfText(bytes: Uint8Array, maxChars = 20000): Promise<string | null>` via `unpdf` (`extractText`, merged pages); non-PDF or no text layer → null. Images are not OCR'd in this plan (see "Left out").
- `summarizeCaseAs(actor: StaffUser, caseId: string): Promise<{ status: "ok" | "unavailable" | "disabled" }>` — staff/admin/commissioner may request; builds `complaint` (summary + description) and `timeline` (non-`sms_failed` events in order: type, date, and for notes/info requests/answers their text; plus extracted text of `parties` PDFs, each capped at 4000 chars), redacts both with the same parties as Task 3, calls `provider.summarizeCase`, stores `ai_outputs` kind `case_summary`, audits `ai_summary` with actor.

- [ ] **Step 1: Failing tests:** `extractPdfText` returns the fixture's text, null for a PNG; summary of a case with a note containing a phone number → provider input has `[PHONE]`; stored row kind `case_summary`; audit actor is the officer; disabled → `disabled`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(ai): on-demand case file summary`.

### Task 6: Staff UI — AI panel, apply, flags, switch

**Files:**
- Create: `src/components/staff/AiPanel.tsx`, `src/components/staff/FlagsPanel.tsx`
- Modify: `src/app/[locale]/staff/(app)/cases/[caseNumber]/{page.tsx,actions.ts,CaseActions.tsx}`, `src/app/[locale]/staff/(app)/admin/settings/{SettingsForm.tsx}`, `src/app/[locale]/staff/(app)/admin/actions.ts`, `src/lib/admin/settings.ts` (+`aiEnabled`), messages en/sw
- Test: `tests/e2e/ai.spec.ts`

**Interfaces:**
- Case page sidebar, above actions: **AI panel** — when disabled: "AI is switched off"; when latest triage `ok`: badge "AI-generated suggestion", category, priority, urgency reasons, summary in the viewer's language (other language behind a toggle), buttons **Apply suggestion** (server action `applyAiSuggestionAction` → `assertStaff(["staff","admin"])` → `setCategoryPriorityAs` with the stored suggestion; audited `ai_suggestion_applied`) and **Re-run triage** (`triageCase(caseId, actor)`); when `unavailable`: "AI suggestion unavailable" + Re-run. **Summarize case file** button → `summarizeCaseAs`; latest summary shown with the same label, key dates and open questions.
- **Flags panel** (always, AI on or off): possible duplicates (links) and advocate history counts.
- Admin settings: checkbox "Use AI assistance" (`aiEnabled`), saved via `updateWorkflowSettingsAs` (audited before/after).
- Complainant pages unchanged: they never query `ai_outputs` or flags (RLS also blocks them).

- [ ] **Step 1: Failing e2e (AI_PROVIDER=fake in playwright env):** complainant files "advocate withheld my money … KES 40,000"; staff opens the case → AI panel shows "AI-generated suggestion" with priority High; Apply → case category/priority updated and timeline shows "Category and priority set"; Summarize → summary block appears; complainant's case page contains no "AI-generated"; admin unticks "Use AI assistance" → staff case page shows "AI is switched off" (setting restored at the end); a commissioner sees no Apply button and a direct `applyAiSuggestionAction` call returns forbidden (covered by db test in this task: `tests/db/ai-apply.test.ts`).
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx playwright test tests/e2e/ai.spec.ts && npx vitest run tests/db/ai-apply.test.ts`).
- [ ] **Step 5:** Commit `feat(staff): AI suggestion panel, case summary and flags`.

### Task 7: Triage eval set and docs

**Files:**
- Create: `evals/triage-cases.jsonl` (30 synthetic complaints: 10 English, 10 Swahili, 10 Sheng/mixed; each `{text, expected_category, expected_priority_min}`), `scripts/eval-triage.mts`
- Modify: `README.md` (AI section: providers, switch, what is sent, how to run the eval), `docs/deploy.md` (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, DPA note: switch off or self-host before real data)

**Interfaces:**
- `scripts/eval-triage.mts [--provider claude|fake] [--limit N]`: redacts each case, calls the provider, prints category accuracy, priority-at-least accuracy, unavailable count, and token usage/cost estimate; refuses to run with `claude` unless `--yes` is passed (it spends money).

- [ ] **Step 1:** Run `npx tsx scripts/eval-triage.mts --provider fake` → Expected: prints accuracy table for 30 cases, exit 0.
- [ ] **Step 2:** (Only with the user's go-ahead and a key) `npx tsx scripts/eval-triage.mts --provider claude --yes` → record accuracy in README.
- [ ] **Step 3:** Full suite `npm test && npm run test:e2e && npm run build` → all pass.
- [ ] **Step 4:** Commit `docs: AI triage eval and configuration`.

## Left out of this plan (explicit)

- **OCR of scanned images and image-only PDFs.** The spec calls for OCR before redaction; doing it locally (e.g. tesseract.js with an English+Swahili model) is a sizeable dependency and slow on serverless. This plan extracts text from text-layer PDFs only and notes "scanned document — not read by AI" in the summary input. Revisit in Plan 6 if time allows.
- Batch re-triage of existing cases, and any automatic application of AI output.
