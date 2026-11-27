# Plan 8 — Mizani reads scanned documents through soma-OCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every scanned PDF and image uploaded to Mizani is sent to a soma-OCR instance after the upload; staff see the text with its confidence, and the AI case summary uses it when it is reliable.

**Architecture:** An env-selected OCR provider (`none` | `http` | `fake`) mirrors the AI provider. After an upload, one `after()` task per document reads it and writes a `document_texts` row; the daily cron retries and backfills. Staff and commission case pages show the text; complainant and advocate pages never do.

**Tech Stack:** Next.js 15 (App Router, server actions, `after()`), TypeScript strict, Supabase (Postgres, RLS, storage), Vitest, next-intl (en/sw).

**Spec:** `docs/superpowers/specs/2026-11-27-ocr-service-design.md`, **Part 2** (Part 1 describes the soma-OCR API this client calls; Plan 7 builds it).

## Global Constraints

- Work in a git worktree: `.worktrees/plan-8-ocr` on branch `plan-8-ocr` cut from `origin/main` (the shared folder is on another session's branch; never switch it). Add `.worktrees/` to `.git/info/exclude` if missing. Commit the spec and both plans as the first commit.
- Mizani talks to soma-OCR only through its public API: `POST {OCR_URL}/v1/ocr`, multipart `file` + `languages=eng+swa`, header `Authorization: Bearer {OCR_API_KEY}`; response `{ engine, languages, page_count, pages[], text, confidence, duration_ms }`; errors `{ error, message }`.
- Env: `OCR_PROVIDER` = `none` (default) | `http` | `fake`; `http` needs `OCR_URL` and `OCR_API_KEY`, otherwise OCR is off with one warning.
- OCR never slows or breaks an upload: nothing OCR-related runs before the response; every OCR error is caught and recorded.
- OCR text and status appear only to staff roles (`staff`, `admin`, `commissioner`); never on complainant or advocate pages or APIs.
- AI summary uses OCR text only when confidence **≥ 60**, labelled as read by OCR, and it passes through `redact()` like every other line.
- New UI copy in both `messages/en.json` and `messages/sw.json` (parity is tested); plain wording per DESIGN.md (verb + object buttons, attention states in `accent-soft`/`accent-ink`).
- New env vars in `.env.example` and the env table in `docs/handover/self-hosting.md` (enforced by `tests/unit/handover-docs.test.ts`).
- Commits: no co-author or tool attribution lines (user instruction). Push only after a clean secret scan.

## Review Focus

1. **The immutable audit log must not keep OCR text.** The generic `audit_row_change()` stores whole old/new rows on update and reads `new.id` (which `document_texts` lacks). A dedicated trigger records only `status`, `attempts`, `confidence`, `page_count`, `error`. (Task 2)
2. **A complainant or advocate querying `document_texts` directly** (Supabase client with their session) gets zero rows. (Task 2)
3. **The cron and an `after()` task reading the same document at once** → one soma-OCR call, not two: a row is claimed with a conditional update (`status <> 'done'` and not claimed in the last 5 minutes). (Task 3)
4. **soma-OCR answers 413/415/422/400** (e.g. a 6 MB file sent to the Vercel demo) → recorded `failed` with the error code and *not* retried; 429/5xx/timeouts are retried up to 3 attempts. (Tasks 1, 3)
5. **OCR switched off by an admin while rows are pending** → the cron sends nothing and queues nothing; the rows stay `pending`. (Task 3)

---

### Task 1: The OCR provider

**Files:**
- Create: `src/lib/ocr/provider.ts`, `src/lib/ocr/http.ts`, `src/lib/ocr/fake.ts`, `src/lib/ocr/index.ts`
- Test: `tests/unit/ocr-provider.test.ts`

**Interfaces:**
- Produces:
  - `interface OcrResult { text: string; confidence: number; pageCount: number; engine: string }`
  - `class OcrError extends Error { code: string; retryable: boolean }`
  - `interface OcrProvider { name: string; read(bytes: Uint8Array, fileName: string, mime: string): Promise<OcrResult> }`
  - `getOcrProvider(): OcrProvider | null` and `resetOcrProviderForTests(): void` in `index.ts`, cached and warn-once exactly like `getAiProvider()` in `src/lib/ai/index.ts`.
  - `FakeOcrProvider` (public `calls: { fileName: string }[]`): returns `{ text: "Scanned text of <fileName>", confidence: 90, pageCount: 1, engine: "fake" }`; a file name containing `low-confidence` → confidence 40; containing `ocr-fail` → throws `OcrError("engine_error", true)`.
  - `HttpOcrProvider(url, apiKey)`: one `fetch` with `FormData` (file as `Blob` with the mime, `languages=eng+swa`), `AbortSignal.timeout(120_000)`. Non-2xx → `OcrError(body.error ?? "http_<status>", retryable = status === 429 || status >= 500)`; network error or timeout → `OcrError("unreachable", true)`.

- [ ] **Step 1: Write the failing tests** (`ocr-provider.test.ts`, `vi.stubGlobal("fetch", …)` for HTTP):
  - `OCR_PROVIDER` unset → `getOcrProvider()` is `null`; `fake` → name `fake`; `http` without `OCR_API_KEY` → `null` and `console.warn` called once across two calls.
  - HTTP success: the request goes to `https://ocr.example/v1/ocr` with `Authorization: Bearer k`, a form field `languages` = `eng+swa` and a `file` field; the JSON `{ text: "hello", confidence: 87.5, page_count: 2, engine: "tesseract 5.3" }` maps to `{ text: "hello", confidence: 87.5, pageCount: 2, engine: "tesseract 5.3" }`.
  - HTTP 413 `{ error: "file_too_large" }` → `OcrError` with `code: "file_too_large"`, `retryable: false`; 503 → `retryable: true`; `fetch` rejecting → `code: "unreachable"`, `retryable: true`.
  - Fake: `low-confidence.png` → 40; `ocr-fail.png` throws a retryable `OcrError`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/ocr-provider.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ocr): OCR provider (none/http/fake) for soma-OCR`.

### Task 2: `document_texts` table, RLS and audit

**Files:**
- Create: `supabase/migrations/20261202000001_document_texts.sql`
- Test: `tests/db/ocr-rls.test.ts`

**Interfaces:**
- Produces table `public.document_texts`: `document_id uuid primary key references documents(id) on delete cascade`, `status text not null default 'pending' check (status in ('pending','done','failed','skipped'))`, `text text`, `page_count int`, `confidence numeric(5,1)`, `engine text`, `error text`, `attempts int not null default 0`, `claimed_at timestamptz`, `created_at`/`updated_at timestamptz not null default now()`; index on `status`.
- RLS on; one policy `staff_read_document_texts` for select to authenticated using `public.staff_role() is not null` (same rule as `staff_read_documents`); no insert/update/delete policies (the service role writes).
- Trigger function `public.audit_document_text_change()` (security definer, `search_path = public`) inserting into `audit_log` with `entity = 'document_texts'`, `entity_id = coalesce(new.document_id, old.document_id)::text`, and `details` built only from `status`, `attempts`, `confidence`, `page_count`, `error` (old and new on update) — never `text`.

- [ ] **Step 1: Write the failing tests** (`ocr-rls.test.ts`, helpers from `tests/helpers/db.ts`): create a case with `makeCase`, a `documents` row and, with `adminClient()`, a `document_texts` row (`status: "done"`, `text: "secret words"`); then:
  - an officer (`signInStaff("staff", …)`) and a commissioner can select it;
  - the case's complainant (`signInAs("complainant", …)`) and an advocate (`signInAdvocate`) get `[]`;
  - a staff client's `insert` into `document_texts` fails;
  - after an admin-client update to `status: "failed"`, the newest `audit_log` row for that `entity_id` exists and `JSON.stringify(details)` does not contain `secret words` (Review Focus 1);
  - deleting the `documents` row removes the `document_texts` row.
- [ ] **Step 2: Run** `npx vitest run tests/db/ocr-rls.test.ts`. Expected: FAIL (relation does not exist).
- [ ] **Step 3: Write the migration** and apply it to the Supabase project with the Supabase MCP `apply_migration` (name `document_texts`).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ocr): document_texts table with staff-only RLS and text-free audit`.

### Task 3: Reading documents — after uploads, from the cron, and the admin switch

**Files:**
- Create: `src/lib/ocr/run.ts`
- Modify: `src/lib/cases/evidence.ts` (return document ids), `src/lib/cases/file-complaint.ts` (result gains `documentIds: string[]`), `src/lib/cases/respond.ts` and `src/lib/advocates/respond.ts` (return/forward the ids), the server actions that call them (complainant filing, walk-in intake, complainant reply `src/app/[locale]/(complainant)/my/cases/[caseNumber]/actions.ts`, advocate response `src/app/[locale]/advocate/(app)/cases/[caseNumber]/actions.ts`), `src/app/api/cron/deadlines/route.ts`; settings: `src/lib/cases/workflow-config.ts`, `src/lib/cases/load-workflow.ts`, `src/lib/admin/settings.ts`, `src/app/[locale]/staff/(app)/admin/settings/SettingsForm.tsx`, `src/app/[locale]/staff/(app)/admin/actions.ts`, `messages/en.json`, `messages/sw.json`
- Test: `tests/db/ocr-run.test.ts`, extend `tests/unit/workflow-config.test.ts`

**Interfaces:**
- Consumes: `getOcrProvider`, `OcrError` (Task 1); `document_texts` (Task 2); `extractPdfText(bytes, maxChars)` from `src/lib/ai/document-text.ts`; `loadWorkflow()`.
- Produces (in `run.ts`):
  - `MAX_OCR_ATTEMPTS = 3`, `OCR_SWEEP_BATCH = 5`.
  - `runOcr(documentId: string): Promise<"done" | "failed" | "skipped" | "pending" | "off">` — `off` when the setting is off or there is no provider (nothing written); otherwise upsert the row, claim it (conditional update: `status <> 'done'`, `attempts < MAX_OCR_ATTEMPTS`, `claimed_at` null or older than 5 minutes; set `claimed_at = now()`, `attempts = attempts + 1`; zero rows claimed → return the current status without calling soma-OCR), download from bucket `evidence`; a PDF where `extractPdfText` returns text → `skipped`; otherwise `provider.read(...)` → `done` with `text`, `confidence`, `page_count`, `engine`, `error = null`; `OcrError` not retryable → `failed` with `attempts = MAX_OCR_ATTEMPTS`; retryable → `failed` (retried by the cron while `attempts < MAX`). Always clears `claimed_at`. Never throws.
  - `queueOcr(documentIds: string[], schedule: (task: () => Promise<void>) => void): void` — one `schedule(() => runOcr(id).then(() => {}))` per id.
  - `sweepOcr(): Promise<{ processed: number }>` — when on: up to `OCR_SWEEP_BATCH` documents, oldest first, that are either missing a row (backfill) or `pending`/`failed` with `attempts < MAX_OCR_ATTEMPTS`; run them one after another.
  - `rereadOcr(documentId: string): Promise<void>` — resets `attempts = 0`, `status = 'pending'`, `error = null` (used by Task 4).
- `uploadEvidence(...)` returns `Promise<string[]>` of **document ids** (from `insert(...).select("id").single()`).
- `WorkflowConfig.ocrEnabled: boolean` (default `true`, setting key `ocr_enabled`), handled everywhere `aiEnabled`/`ai_enabled` is; the settings form checkbox `ocrEnabled` sits under "Use AI assistance", label `admin.settings.ocrEnabled` = "Read scanned documents (OCR)" / "Soma nyaraka zilizoskaniwa (OCR)".
- The server actions call `queueOcr(ids, (t) => after(t))` after the existing work; the cron route returns `{ ...deadlines, ocr: await sweepOcr() }`.

- [ ] **Step 1: Write the failing tests**
  - `workflow-config.test.ts`: `parseWorkflowConfig([])` has `ocrEnabled: true`; `[{ key: "ocr_enabled", value: false }]` → `false`; a non-boolean value → `true`.
  - `ocr-run.test.ts` (`OCR_PROVIDER=fake`, `resetOcrProviderForTests()`; uploads through `uploadEvidence` with `File`s built in the test):
    - `fileComplaint` with a PNG returns one id in `documentIds`; `runOcr(id)` → `"done"`; the row has `text` `"Scanned text of receipt.png"`, `confidence` 90, `page_count` 1, `attempts` 1.
    - A text PDF (`makeTextPdf` from `tests/helpers/pdf`) → `"skipped"` and the fake provider was not called.
    - `ocr-fail.png` → `"failed"`, `attempts` 1; calling `sweepOcr()` twice more reaches `attempts` 3 and a fourth sweep does not call the provider again.
    - A non-retryable error (stub the fake to throw `new OcrError("file_too_large", false)`) → `failed`, `error` `"file_too_large"`, `attempts` 3 (Review Focus 4).
    - Two concurrent `runOcr(id)` calls on a fresh document → the fake provider records exactly one call (Review Focus 3).
    - With `ocr_enabled` set to `false` in `settings`: `runOcr` → `"off"` and no row is written; `sweepOcr()` → `{ processed: 0 }` (Review Focus 5). Restore the setting in `afterAll`.
    - A document inserted without a row is picked up by `sweepOcr()` (backfill).
    - `OCR_PROVIDER=none` → `runOcr` → `"off"`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/workflow-config.test.ts tests/db/ocr-run.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `run.ts`, the setting, the `uploadEvidence` id change and its callers, the action wiring and the cron call.
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit`. Expected: PASS, no type errors (callers of `uploadEvidence`/`fileComplaint` compile).
- [ ] **Step 5: Commit** `feat(ocr): read uploaded scans after the response, retry and backfill from the cron, admin switch`.

### Task 4: Staff and commission pages show the text; "Read text again"

**Files:**
- Create: `src/components/case/OcrText.tsx`
- Modify: `src/app/[locale]/staff/(app)/cases/[caseNumber]/page.tsx` (documents list, ~line 40 and 117–131), `src/app/[locale]/staff/(app)/cases/[caseNumber]/actions.ts`, `src/app/[locale]/commission/(app)/cases/[caseNumber]/page.tsx` (~line 38 and 122–135), `messages/en.json`, `messages/sw.json`
- Test: `tests/db/ocr-ui.test.ts`; manual check in the browser

**Interfaces:**
- Consumes: `document_texts` (Task 2), `rereadOcr`, `runOcr` (Task 3).
- Produces: `<OcrText text={row | null} canReread={boolean} documentId={string} />` (server component; the button is a small form posting to `rereadOcrAction`). States: no row → nothing; `pending` → "Reading the text of this scan…"; `skipped` → nothing; `failed` → "The text of this scan could not be read." plus the button when `canReread`; `done` → a `<details>` whose summary is "Text read from this scan (OCR) · confidence {n}%" and whose body is the text (`whitespace-pre-wrap`, max-height with scroll) and the note "OCR can misread words. Check against the scan."; confidence < 60 adds "Low confidence" in `accent-soft`/`accent-ink`.
- `rereadOcrAction(formData)` in the staff actions: staff session with role `staff` or `admin` (commissioners and others → no-op with an error state); calls `rereadOcr(id)` then `after(() => runOcr(id))`; revalidates the case page.
- Both pages fetch the documents with the embedded relation `document_texts(status,text,confidence,page_count)` through the user's Supabase client (RLS applies).
- i18n keys under `case.ocr.*` in both languages; button copy "Read text again" / "Soma maandishi tena".

- [ ] **Step 1: Write the failing test** (`ocr-ui.test.ts`): calling `rereadOcrAction` as a commissioner leaves the row unchanged; as an officer it resets `attempts` to 0 and, after the scheduled task (inject `after` by mocking `next/server`'s `after` to run the task immediately), the row is `done`.
- [ ] **Step 2: Run** `npx vitest run tests/db/ocr-ui.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component, the action, the two page changes and the copy.
- [ ] **Step 4: Run** the test and `npx vitest run tests/unit/i18n-keys.test.ts`. Expected: PASS.
- [ ] **Step 5: Browser check** with `OCR_PROVIDER=fake` on the dev server: file a walk-in complaint with a PNG; the staff case page shows "Text read from this scan (OCR) · confidence 90%" after a refresh, in en and sw; the commission page shows it without the button; the complainant's own case page shows no OCR text.
- [ ] **Step 6: Commit** `feat(ocr): show OCR text to staff and commissioners, with Read text again`.

### Task 5: AI summary uses reliable OCR text; docs and env

**Files:**
- Modify: `src/lib/ai/summarize.ts` (lines 24–50), `.env.example`, `docs/handover/self-hosting.md`, `docs/handover/operations.md`, `docs/handover/data-protection.md`, `docs/handover/security.md` (line 48), `README.md`
- Test: extend `tests/db/ai-summary.test.ts`

**Interfaces:**
- Consumes: `document_texts` (Task 2); `FakeAiProvider.calls` (records the timeline it was given).
- Produces: in the summary input, for an image or a PDF without a text layer: done with confidence ≥ 60 → `Document <name> (text read by OCR, confidence <n>%):\n<text sliced to PER_DOC_CHARS>`; done below 60 → `Document <name>: scanned, but the text could not be read reliably.`; otherwise → `Document <name>: scanned, text not read yet.` All lines still go through `redact()`.

- [ ] **Step 1: Write the failing tests** (`ai-summary.test.ts`): a case with a PNG whose `document_texts` row is `done`, confidence 85, text containing the complainant's phone number → the fake AI's timeline contains `text read by OCR` and the redaction placeholder, not the phone number; a row with confidence 40 → the timeline contains `could not be read reliably` and none of the row's text; no row → `text not read yet`.
- [ ] **Step 2: Run** `npx vitest run tests/db/ai-summary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the summary change (one query for the case's `document_texts`), and update the docs:
  - `.env.example`: `OCR_PROVIDER=none`, `OCR_URL=`, `OCR_API_KEY=`.
  - `self-hosting.md` env table rows for the three vars (`OCR_API_KEY` secret: yes) and a "Running soma-OCR next to Mizani" section (link to `https://github.com/mal161/soma-OCR`, `docker run` on the same server, `OCR_URL=http://localhost:8080`).
  - `operations.md`: the cron now also retries/backfills OCR (5 per run, 3 attempts); "Read text again".
  - `data-protection.md`: documents go only to the ACC's own soma-OCR in Kenya; OCR text is staff-only, not in the audit log; low-confidence text is kept out of AI.
  - `security.md:48`: replace the "no OCR" line with the new behaviour.
  - `README.md`: one line linking soma-OCR.
- [ ] **Step 4: Run** the full suite: `npx vitest run` and `npx tsc --noEmit` and `npm run lint`. Expected: all PASS (including `handover-docs.test.ts`).
- [ ] **Step 5: Commit** `feat(ocr): AI summary uses reliable OCR text; docs and env`.

### Task 6: Review, PR and demo configuration

- [ ] **Step 1:** Final review of the branch by a fresh reviewer on the most capable model; fix what it confirms.
- [ ] **Step 2:** Secret scan of the diff; push `plan-8-ocr`; open the PR against `main` (no attribution lines). The user merges unless they ask me to.
- [ ] **Step 3: Demo env (after Plan 7 is deployed and the PR is merged):** set `OCR_PROVIDER=http` and `OCR_URL=<the soma-OCR production URL>` on the Mizani Vercel project; open a terminal tab running `vercel env add OCR_API_KEY production --sensitive` for the user to paste the same key they gave soma-OCR. Then `vercel deploy --prod` from the main branch and smoke test: walk-in complaint with a scanned PNG → the staff case page shows the text within a minute or two.
