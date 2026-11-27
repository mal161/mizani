# OCR: the soma-OCR service and its use in Mizani — design

Date: 2026-11-27. Status: approved by the user on 2026-11-27.
Decided with the user: a separate open-source OCR service with its own API (option B); its own public GitHub repository; **no relationship to Mizani in the service's code, name, settings or docs** (the user plans to host it later for other developers); the hackathon demo instance runs on Vercel container functions; the service is named **soma-OCR** (GitHub `mal161/soma-OCR`) and its working directory is `C:\Users\ALEX MWANGI\OneDrive\Pictures\Documents\vs. code projects\soma-OCR`.

This document has two parts. **Part 1** is the service, written so that it can be copied unchanged into the service repository as its own design doc — it never names Mizani. **Part 2** is Mizani's side: one client among many.

---

# Part 1 — soma-OCR: an open-source OCR API

*Soma* is Swahili for "read". The product and its repository are named **soma-OCR**.

## Intent and why

Many systems receive scanned documents and photos of paper — letters, receipts, forms — and need their text: to summarise them, search them or check them. Cloud OCR services are not open source and send documents to another country, which public bodies under data-protection laws (such as Kenya's Data Protection Act 2019) often cannot do. soma-OCR is a small, self-hostable OCR service any developer can run with one `docker run`, call over HTTP with an API key, and host wherever their documents are allowed to go.

Success: a developer who has never seen soma-OCR reads the README, starts it locally, sends a scanned PDF with curl and gets its text back with a confidence score, in under ten minutes; and can deploy the same image to Vercel, Render or their own server.

## Goals

1. Read printed text from scanned PDFs and JPEG/PNG images, returning text per page with a confidence score.
2. A small, stable, versioned HTTP API (`/v1`) with per-client API keys and machine-readable docs (OpenAPI).
3. One Docker image that runs the same on a laptop, a container platform or a private server.
4. Privacy by design: documents are processed and forgotten; document text never appears in logs.
5. Easy to extend: more languages through a build setting; the engine can be swapped behind the same API later.

## Non-goals

- Handwriting, tables/layout/form-field extraction, translation, search, storing documents.
- Accounts, sign-ups, billing, per-client quotas or a dashboard (a hosted platform may come later; nothing in this design should block it).

## Anti-goals

- Keeping documents or their text after answering, or logging text or file names.
- Code, names, defaults, examples or docs that assume one particular client application.
- Non-permissive dependencies (AGPL/GPL libraries linked into the service) that would stop others from hosting or modifying it.

## Constraints

- Open source under **Apache-2.0**; dependencies permissive (Apache/MIT/BSD). Tesseract (Apache-2.0) is the engine; PDF pages are rendered with **pypdfium2** (not PyMuPDF, which is AGPL).
- Must run within common serverless container limits: ~2 GB memory, 1 vCPU, a few minutes per request, request bodies of ~4.5 MB on some hosts (Vercel).
- Must start without any external service (no database, no queue).

## Design

- **Stack:** Python 3.12, FastAPI + Uvicorn, Tesseract 5, pypdfium2, Pillow (greyscale, EXIF rotation, upscaling small images). Runs as a non-root user and listens on `$PORT` (default 8080).
- **Languages:** the image installs Tesseract language packs from a build argument, `TESSERACT_LANGS` (default `eng swa` — English and Kiswahili); `DEFAULT_LANGUAGES` (default `eng`) is used when a request names none. Requests may ask only for installed languages.
- **API v1:**
  - `POST /v1/ocr` — `multipart/form-data`: `file` (PDF, JPEG or PNG) and optional `languages` (e.g. `eng+swa`). Header `Authorization: Bearer <key>`.
    200: `{ "engine": "tesseract 5.x", "languages": "eng+swa", "page_count": n, "pages": [{ "number": 1, "text": "...", "confidence": 0–100 }], "text": "...", "confidence": 0–100, "duration_ms": n }`.
    Errors as JSON `{ "error": "<code>", "message": "..." }`: 400 bad request or unsupported language, 401 missing/wrong key, 413 file too large or too many pages, 415 unsupported type (checked by the file's magic bytes, not its declared type), 422 unreadable or corrupt file, 429 too busy, 500 engine failure. Every response carries an `X-Request-Id`.
  - `GET /v1/languages` — installed languages (needs a key).
  - `GET /health` — `{ ok, engine, languages }`, no key, no counts.
  - OpenAPI at `/openapi.json` and interactive docs at `/docs`.
  - Breaking changes go to a new version (`/v2`) while `/v1` keeps working.
- **Settings (env):** `API_KEYS` (`name:key` pairs, comma-separated; e.g. `client-a:…,client-b:…`), `MAX_FILE_MB` (10), `MAX_PAGES` (20, beyond which a document is refused, not truncated), `DEFAULT_LANGUAGES`, `CORS_ORIGINS` (empty = no browser access; server-to-server by default), `PORT`. Keys are compared in constant time; the key's *name* appears in logs, the key never does.
- **Privacy:** each request's files live in memory or a per-request temporary directory deleted before responding. Logs: request id, client name, bytes, pages, duration, status — never text or file names.
- **Tests (pytest):** fixtures are generated in the test run (Pillow renders known English and Kiswahili sentences to a PNG and to an image-only PDF); tests check the recognised text, confidence, page limits and every error code, plus an **independence check** that fails if the repository mentions any particular client application.
- **Repository:** public `mal161/soma-OCR`, with README (what it is, quick start, curl examples, settings, deploying to Vercel / Render / a server), `docs/design.md` (this Part 1), LICENSE (Apache-2.0), CHANGELOG, Dockerfile at the root, and GitHub Actions running the tests.
- **Hosting:** any Docker host. Vercel container functions (beta) work within their limits; Render or a private server are documented alternatives.

## Left to the builder (Part 1)

- Exact preprocessing (thresholding, deskew) as long as the fixtures read correctly; worker concurrency and the 429 rule.

---

# Part 2 — Mizani's use of soma-OCR

## Why

The Mizani design (§11) says uploaded documents get their text extracted, with OCR for scans, before AI summarisation; today scans are stored but not read, and the handover docs list this as a known limit. Mizani becomes a soma-OCR client.

Success: an officer files a walk-in complaint with a scanned receipt; usually within a minute the staff case page shows the receipt's text with its confidence, and "Summarize case file" uses it.

## Goals, non-goals, anti-goals (Mizani)

- Goals: read every scanned PDF and image uploaded through any path (online filing, walk-in intake, complainant replies, advocate responses) without slowing or endangering the upload; show staff the text with its confidence; let the AI summary use it; keep OCR optional (Mizani works as today when it is off or soma-OCR is down).
- Non-goals: editing OCR text; searching it.
- Anti-goals: OCR text or status shown to complainants or advocates; filing slowed or broken by OCR; real (non-demo) documents sent to a soma-OCR instance outside Kenya.

## Constraints (Mizani)

- Next.js 15, TypeScript strict, Supabase (RLS, private bucket `evidence`), Vercel Hobby (4.5 MB request body — no upload larger than that reaches the demo). Evidence: up to 5 files, 10 MB each, PDF/JPEG/PNG (`src/lib/cases/schema.ts`).
- Every upload goes through `uploadEvidence()` (`src/lib/cases/evidence.ts`); `afterFiling(caseId, (task) => after(task))` already runs work after the response.
- Follow existing patterns: env-selected providers with none/fake/real (`src/lib/ai/index.ts`), `redact()` before AI, staff-only data behind RLS, everything audited, en/sw parity, the daily cron `/api/cron/deadlines`.

## Design (Mizani)

- **Provider:** `getOcrProvider()` like `getAiProvider()`: `OCR_PROVIDER` = `none` (default) | `http` | `fake` (tests); `http` uses `OCR_URL` and `OCR_API_KEY` and asks soma-OCR for `eng+swa`. Missing settings mean OCR off, with one warning. Mizani talks to soma-OCR only through its public `/v1` API.
- **When:** after an upload, one `after()` task per document; failures are recorded, never shown to the uploader. Images always go to soma-OCR; PDFs only when `extractPdfText()` finds no text layer (otherwise `skipped`). *Builder's call:* "within a minute" is best effort; anything unfinished stays `pending`.
- **Admin switch (builder's call):** Workflow setting "Read scanned documents (OCR)" (`ocr_enabled`, default on), next to "Use AI assistance"; off means nothing is sent and nothing new is queued.
- **Storage:** table `document_texts` — `document_id` (PK, FK cascade), `status` (`pending` | `done` | `failed` | `skipped`), `text`, `page_count`, `confidence`, `engine`, `error` (short code), `attempts`, timestamps. RLS: readable by all staff roles (same rule as `documents`), no client writes; changes audited.
- **Retries and backfill (builder's call):** the daily cron retries `pending`/`failed` rows (bounded attempts) and reads documents that have no row yet (documents uploaded before launch), in small batches. Officers and admins can press **Read text again**.
- **UI:** staff and commission case pages show "Text read from this scan (OCR)" under each scanned document, with confidence and a note that OCR can be wrong (en/sw). Never on complainant or advocate pages.
- **AI summary (builder's call):** uses OCR text only for documents with mean confidence **≥ 60**, labelled "text read by OCR" and passed through `redact()`; below that the summary says the scan could not be read reliably. (Garbled text can hide names from redaction, so this is a data-protection rule too.)
- **Docs:** README links to the soma-OCR repository; `docs/handover/self-hosting.md` (running soma-OCR next to Mizani, env vars), `operations.md`, `data-protection.md` (documents go only to the ACC's own soma-OCR in Kenya), `security.md`; new env vars in `.env.example` and the env table (enforced by `tests/unit/handover-docs.test.ts`).

## Hosting (Mizani's soma-OCR instances)

- **ACC production:** the soma-OCR image on ACC servers in Kenya, next to Mizani.
- **Hackathon demo (decided by the user):** soma-OCR as its own Vercel project (container functions, beta) on the user's Hobby account, built from the Dockerfile at the root of `mal161/soma-OCR`. If the beta runtime fails, the same image goes to Render's free Docker hosting and Mizani's `OCR_URL`/`OCR_API_KEY` change. Demo data is synthetic, so a host outside Kenya is acceptable for the demo only.

## Left to the builder (Part 2)

- How `uploadEvidence` hands document ids to the OCR scheduler (it returns storage paths today), retry count and backfill batch size.
- Exact UI wording (en/sw) and where the text expands on the case pages; what `fake` OCR returns, as long as tests are deterministic.

## Approaches considered (the user picked B)

- **A. OCR inside Mizani (tesseract.js):** no new hosting, but slow, near Vercel limits, printed text only, not reusable. Rejected.
- **B. Separate open-source OCR service with its own API — chosen**, now as an independent product (Part 1) that Mizani uses (Part 2).
- **C. Public multi-tenant OCR platform now:** weeks of work and a bigger data-protection surface before the deadline. Rejected for now; Part 1 keeps the door open.
- Cloud OCR (Google Vision, AWS Textract): not open source and sends documents abroad. Rejected.
