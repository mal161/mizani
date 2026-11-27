# Plan 7 — soma-OCR v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An independent, open-source OCR service (soma-OCR) that reads printed text from scanned PDFs and JPEG/PNG images over a small, versioned, key-protected HTTP API, shipped as one Docker image and deployed to Vercel for the demo.

**Architecture:** A stateless FastAPI app wraps Tesseract 5; PDFs are rendered page by page with pypdfium2; nothing is stored. Settings come from env. Tests run in Docker (Tesseract is not installed on the Windows dev machine) and in GitHub Actions.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, python-multipart, pytesseract, pypdfium2, Pillow, pytest, httpx; Docker; GitHub Actions; Vercel container functions (beta).

**Spec:** `docs/superpowers/specs/2026-11-27-ocr-service-design.md` (Mizani repo), **Part 1 only**.

## Global Constraints

- Working directory: `C:\Users\ALEX MWANGI\OneDrive\Pictures\Documents\vs. code projects\soma-OCR` (a new git repo; request access to the folder from the app before the first file write). GitHub: public `mal161/soma-OCR`.
- **Independence:** nothing in the repository — code, names, settings, examples, tests, docs, commit messages — may name or assume a particular client application. Examples use `client-a` / `client-b`.
- Licence Apache-2.0. Dependencies permissive only (Apache/MIT/BSD/HPND). Never PyMuPDF (AGPL).
- API v1 exactly as the spec: `POST /v1/ocr`, `GET /v1/languages`, `GET /health`, `/openapi.json`, `/docs`; JSON errors `{ "error": code, "message": text }`; `X-Request-Id` on every response.
- Settings (env) and defaults: `API_KEYS` (`name:key,…`), `MAX_FILE_MB=10`, `MAX_PAGES=20`, `DEFAULT_LANGUAGES=eng`, `CORS_ORIGINS` (empty), `PORT=8080`, plus `MAX_CONCURRENT=2` (builder's call for the 429 rule). Build arg `TESSERACT_LANGS="eng swa"`.
- Logs carry request id, client name, bytes, pages, duration, status — never text, file names or keys.
- Commits: no co-author or tool attribution lines (user instruction).
- Preflight: Docker Desktop must be running (`docker info` succeeds); if not, ask the user to start it.

## Review Focus

1. A small file that decodes to a huge image (e.g. a 12,000 × 12,000 white PNG, ~200 KB) → 413 `image_too_large`, not an out-of-memory crash. (Task 3)
2. A phone photo with EXIF rotation → text still read, because the image is rotated upright first. (Task 3)
3. `languages=eng+../../x` or an uninstalled language → 400 `unsupported_language`, never passed to Tesseract. (Task 2)
4. A file declared `image/png` that is really a ZIP or text → 415 by magic bytes. (Task 2)
5. Two requests while `MAX_CONCURRENT` slots are taken → 429 `busy` immediately, not a hang. (Task 3)

---

### Task 1: Repository, settings, health and the Docker test harness

**Files:**
- Create: `pyproject.toml`, `app/__init__.py`, `app/config.py`, `app/main.py`, `Dockerfile`, `.dockerignore`, `.gitignore`, `LICENSE` (Apache-2.0 text), `tests/conftest.py`, `tests/test_health.py`, `tests/test_independence.py`

**Interfaces:**
- Produces: `Settings` (frozen dataclass: `api_keys: dict[str, str]` name→key, `max_file_bytes: int`, `max_pages: int`, `default_languages: str`, `cors_origins: list[str]`, `max_concurrent: int`) and `Settings.from_env(env: Mapping[str, str]) -> Settings`; `create_app(settings: Settings) -> FastAPI`; module-level `app = create_app(Settings.from_env(os.environ))` for Uvicorn.
- Dockerfile stages: `base` (python:3.12-slim + `tesseract-ocr` + one `tesseract-ocr-<lang>` package per `TESSERACT_LANGS` word + `fonts-dejavu-core`), `test` (installs dev deps, `CMD pytest -q`), `runtime` (non-root user, `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}`).

- [ ] **Step 1: Preflight** — run `docker info`. Expected: server info. Otherwise stop and ask the user to start Docker Desktop.
- [ ] **Step 2: Write the failing tests**
  - `test_health.py::test_health_reports_engine_and_languages`: `GET /health` → 200, JSON `ok is True`, `engine` starts with `"tesseract"`, `"eng" in languages` and `"swa" in languages`; no auth header needed.
  - `test_health.py::test_openapi_lists_the_api`: `GET /openapi.json` → 200 and its `paths` include `/v1/ocr`, `/v1/languages`, `/health`; `GET /docs` → 200.
  - `test_health.py::test_settings_from_env_parses_keys_and_defaults`: `Settings.from_env({"API_KEYS": "client-a:k1, client-b:k2"})` → `api_keys == {"client-a": "k1", "client-b": "k2"}`, `max_file_bytes == 10*1024*1024`, `max_pages == 20`, `default_languages == "eng"`, `cors_origins == []`, `max_concurrent == 2`; a malformed pair (`"oops"`) raises `ValueError`.
  - `test_independence.py::test_repository_names_no_client_application`: walk every tracked text file (skip `.git`, binary files and this test file); fail if any matches, case-insensitively, a pattern built from reversed strings `"inazim"`, `"snoissimmoc stnialpmoc setacovda"` (so the forbidden words never appear in the repository).
- [ ] **Step 3: Run** `docker build --target test -t soma-ocr:test . && docker run --rm soma-ocr:test`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** `Settings`, `create_app` with `/health` (languages from `pytesseract.get_languages()` minus `osd`), the Dockerfile stages and `pyproject.toml` (deps pinned to current minor versions).
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** — `git init -b main`, then `git commit -m "feat: service skeleton, settings, health and Docker test harness"`.

### Task 2: API keys, errors, request ids and input checks

**Files:**
- Create: `app/errors.py`, `app/auth.py`, `app/inputs.py`
- Modify: `app/main.py`
- Test: `tests/test_auth.py`, `tests/test_inputs.py`

**Interfaces:**
- Consumes: `Settings`, `create_app` (Task 1).
- Produces: `ApiError(status: int, code: str, message: str)` with a handler rendering `{error, message}`; `require_client(request) -> str` (client name; compares with `hmac.compare_digest` against every key); `detect_kind(data: bytes) -> Literal["pdf","png","jpeg"] | None` (magic bytes `%PDF-`, `\x89PNG\r\n\x1a\n`, `\xff\xd8\xff`); `parse_languages(value: str | None, installed: set[str], default: str) -> str` (regex `^[a-z_]{3,8}(\+[a-z_]{3,8})*$`, every part installed); middleware adding `X-Request-Id` (uuid4 hex) and one metadata log line per request; `GET /v1/languages` → `{ "languages": [...] }` (key required).

- [ ] **Step 1: Write the failing tests**
  - `test_auth.py`: no header → 401 `{"error": "unauthorized"}`; wrong key → 401; `client-a` key → 200 on `/v1/languages`; every response (including 401) has an `X-Request-Id`; a log record for the request contains `client-a` and never the key.
  - `test_auth.py::test_cors`: with default settings a request with `Origin: https://app.example` gets no `access-control-allow-origin`; with `CORS_ORIGINS=https://app.example` it gets that origin back (FastAPI `CORSMiddleware`, added only when the list is non-empty).
  - `test_inputs.py`: `detect_kind` returns `"pdf"`, `"png"`, `"jpeg"` for real headers and `None` for `b"PK\x03\x04"` and `b"hello"`; `parse_languages("eng+swa", {"eng","swa"}, "eng") == "eng+swa"`; `parse_languages(None, …) == "eng"`; `"eng+../../x"` and `"fra"` (not installed) raise `ApiError` 400 `unsupported_language`; `POST /v1/ocr` with a text file named `x.png` → 415 `unsupported_type`; with more than `max_file_bytes` (settings with `MAX_FILE_MB=1`, 1.5 MB body) → 413 `file_too_large`; with no `file` field → 400 `bad_request`.
- [ ] **Step 2: Run** the Docker test command. Expected: FAIL.
- [ ] **Step 3: Implement** the modules; `/v1/ocr` exists but returns 501 after the checks (Task 3 fills it). Read uploads with a size cap rather than trusting `Content-Length`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: API keys, error format, request ids and input checks`.

### Task 3: Reading text from images and PDFs

**Files:**
- Create: `app/ocr.py`
- Modify: `app/main.py`
- Test: `tests/test_ocr.py`, extend `tests/conftest.py`

**Interfaces:**
- Consumes: `detect_kind`, `parse_languages`, `ApiError`, `require_client` (Task 2).
- Produces: `PageResult(number: int, text: str, confidence: float)`; `OcrResult(engine: str, languages: str, pages: list[PageResult], text: str, confidence: float, duration_ms: int)`; `read_document(data: bytes, kind: str, languages: str, max_pages: int) -> OcrResult`. Page confidence = mean of word confidences ≥ 0 from `pytesseract.image_to_data` (0 when no words); document confidence = word-count-weighted mean over pages; `text` = page texts joined by `"\n\n"`; confidences rounded to 1 decimal.
- Image handling: `PIL.Image.MAX_IMAGE_PIXELS = 50_000_000`; a `DecompressionBombError`/pixel count above it → 413 `image_too_large`; `ImageOps.exif_transpose`, greyscale, upscale ×2 when the shorter side < 1000 px. PDFs: pypdfium2 renders each page at 300 dpi; more than `max_pages` pages → 413 `too_many_pages` before rendering; a PDF that fails to open → 422 `unreadable`.
- Concurrency: `asyncio.Semaphore(max_concurrent)` on `app.state.slots`; if no slot is free *right now* → 429 `busy`; OCR runs in a worker thread.

- [ ] **Step 1: Fixtures** in `conftest.py`: `render_png(text: str, rotate_exif: bool = False) -> bytes` (DejaVuSans 40 pt, black on white, 1600×300; with `rotate_exif` the pixels are rotated 90° and EXIF orientation 6 is set); `render_scanned_pdf(pages: list[str]) -> bytes` (each page a rendered PNG, combined with Pillow `save(..., "PDF", save_all=True)` — image-only, no text layer).
- [ ] **Step 2: Write the failing tests** (`test_ocr.py`, all with a valid key):
  - English PNG of `"The advocate received forty thousand shillings"` → 200; lower-cased `text` contains `advocate`, `forty`, `shillings`; `confidence >= 70`; `page_count == 1`; `engine` starts with `tesseract`.
  - Kiswahili PNG of `"Wakili alipokea shilingi elfu arobaini"` with `languages=eng+swa` → text contains `wakili` and `shilingi`; `languages == "eng+swa"`.
  - Two-page scanned PDF → `page_count == 2`, `pages[1].number == 2`, each page's text contains its sentence's key word.
  - EXIF-rotated PNG → text still contains `advocate` (Review Focus 2).
  - 12,000 × 12,000 white PNG → 413 `image_too_large` (Review Focus 1).
  - Three-page PDF with `MAX_PAGES=2` → 413 `too_many_pages`.
  - Bytes `b"%PDF-1.4 garbage"` → 422 `unreadable`.
  - All slots taken (acquire `app.state.slots` in the test) → 429 `busy` without waiting (Review Focus 5).
  - A blank white PNG → 200 with `text == ""` and `confidence == 0`.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement** `read_document` and wire `/v1/ocr`.
- [ ] **Step 5: Run.** Expected: PASS. Then `docker build --target runtime -t soma-ocr . && docker run --rm -p 8080:8080 -e API_KEYS=client-a:local-test-key soma-ocr` and `curl -H "Authorization: Bearer local-test-key" -F file=@<a generated PNG> localhost:8080/v1/ocr` → 200 JSON with the text.
- [ ] **Step 6: Commit** `feat: read text from scanned PDFs and images`.

### Task 4: Documentation, CI and the public repository

**Files:**
- Create: `README.md`, `docs/design.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: README** — what soma-OCR is (one paragraph; *Soma* is Swahili for "read"), quick start (`docker run` with `API_KEYS`), a curl example and its JSON response, the API table with every error code, settings table, adding languages (`TESSERACT_LANGS` build arg), deploying to Vercel (container functions), Render and a private server, privacy (nothing stored, what is logged), licence. Examples use `client-a`.
- [ ] **Step 2: `docs/design.md`** — Part 1 of the spec, copied without its "Part 1 —" heading prefix; `CHANGELOG.md` with `0.1.0 — first release`.
- [ ] **Step 3: CI** — on push and pull request: ubuntu-latest, `apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-swa fonts-dejavu-core`, Python 3.12, `pip install -e .[dev]`, `pytest -q`; plus a job that runs `docker build --target runtime .`.
- [ ] **Step 4: Run** the Docker test command (independence test included). Expected: PASS.
- [ ] **Step 5: Commit** `docs: README, design, changelog and CI`.
- [ ] **Step 6: Publish** — `gh repo create mal161/soma-OCR --public --source . --push` (the user asked for this repository); wait for CI; if green, `git tag v0.1.0 && git push --tags`. Secret scan before pushing: no `API_KEYS=` values other than examples.

### Task 5: Demo deployment on Vercel

**Files:**
- Create (only if the Vercel docs require it): `vercel.json`
- Modify: `README.md` (the Vercel section, with what actually worked)

- [ ] **Step 1: Read** the current Vercel container-runtime docs (`https://vercel.com/docs/functions/runtimes/container`) and apply what they require (Dockerfile at root, `$PORT`).
- [ ] **Step 2: Link and deploy** from the soma-OCR folder: `vercel link --yes --project soma-ocr`, then `vercel git disconnect --yes` if it auto-connects (deploys are manual, as for the main app), then a preview deploy `vercel deploy`.
- [ ] **Step 3: The user adds the key** — open a terminal tab running `vercel env add API_KEYS production --sensitive`; the user types `client-a:<a long random key>` (they will reuse that key in the client app). Never type or print a key yourself.
- [ ] **Step 4: Production deploy** after the user confirms: `vercel deploy --prod --yes`.
- [ ] **Step 5: Smoke test** — `GET /health` → 200 with `eng` and `swa`; `POST /v1/ocr` without a key → 401; then ask the user to run the README's curl example with their key and confirm a 200. If the beta runtime fails to build or run, stop and report: the fallback is Render (documented), which needs the user's account.
- [ ] **Step 6: Commit** the README fix (if any) and push.
