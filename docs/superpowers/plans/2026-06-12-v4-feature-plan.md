# DiScammer v4 — Feature stage: Search, Message Analyzer, Observability + debt burn-down

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Mandatory pre-read for the orchestrator AND for every dispatched worker: the **Hard rules** section below, plus `HANDOFF.md` (gotchas are binding), `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`. Spec lineage: `docs/superpowers/specs/2026-06-12-redesign-v3-design.md`.
>
> Target location in repo: `docs/superpowers/plans/2026-06-12-v4-feature-plan.md`.

**Goal:** Burn down the three high-value debt items from the v3 handoff (bundle re-splitting, island i18n unification, DB connection lifecycle), add observability + an E2E debug harness in CI, and ship five product features that serve PRODUCT.md's core job ("install the pause"): site search, a fully client-side message red-flag analyzer, an RSS feed, per-content OG cards, and course-progress export/import.

**Architecture:** unchanged — SSR Jinja2 + React islands. Every new surface follows the established pattern (Jinja template + `data-component` island + locale keys). The only build-level change is A1 (hashed chunks + Vite manifest), and it is deliberately self-contained.

**Tech Stack:** FastAPI / Jinja2 / aiosqlite (+ SQLite FTS5), React 18 + TS + Vite 6 + Tailwind v4, pytest, **new:** Vitest (unit, frontend) + Playwright `@playwright/test` (E2E in CI), GitHub Actions + docker compose deploy.

---

## Orchestration progress log (maintained by orchestrator)

- **W0 baseline** ✅ (2026-06-12): pytest 28/28, tsc clean, build clean (no drift), 40 full-page screenshots → `/tmp/dcm-v4-before/`. Metrics "Before" column filled. v4 review base SHA = `56a2bef`. Work branch: `v4-features`.
- **W1** ✅ commit `e13324a` — A1 (bundle re-split, hashed chunks + manifest, `base:'/static/'`, Plyr off home, #321-free verified), A3+A4 (1 conn/request + seed flock + `SEED_ON_STARTUP`), A8 (HEAD /play, cert legacy-name guard), A5 (git-LFS config — migrate DEFERRED to owner; prod git-lfs install is a pre-push prerequisite), A6 (nginx vhost + RECONCILE markers). pytest 38, drift guard clean. **Not pushed.**
- **W2** ✅ commit `3289b8b` — backend-obs (O1 request-ID logging + LOG_FORMAT, O2 `/api/health` w/ GIT_SHA+counts+503, F3 **enhanced the existing seo.py feed** 20→30 instead of a duplicate `routers/feeds.py` [avoided a route collision], A7 non-root Dockerfile+compose [container build deferred to owner]); A2 i18n unify (22 client.* namespaces, 168 strings/locale moved verbatim, 114 dead backend keys removed → 485 leaves en==ru, audit+parity tests); F4 (66 per-content OG cards, page_image wired). pytest 46→52. **Gate fixes:** `forceescape`→`tojson` in the `<script>` bundle inject (forceescape corrupts JSON inside `<script>`); RU/EN sweep showed only typewriter animation-phase diffs (text byte-identical), 0 missing keys across all islands incl. quiz/exam/scenario/redflags/cert. **Not pushed.**
- **W3** — in progress (F1 search → F2 analyzer → F5 progress export → I1 integration).

---

**Verification baseline (record in W0 before any change):** `pytest` 28/28, `npx tsc --noEmit` clean, `npm run build` clean, full-page screenshots of every page (RU/EN × desktop/mobile) into `/tmp/dcm-v4-before/`, and the Metrics table at the bottom filled in ("Before" column): home-page JS bytes transferred, `app.js` size, locale dead-key count.

---

## Hard rules (binding for the orchestrator and every worker)

1. **NEVER `git push`.** Push to `main` triggers CI deploy to prod (discammer.com). All commits stay local; pushing is an explicit owner decision at the end.
2. **`backend/static/` is a committed Vite artifact.** Any change under `frontend/src` requires `npm run build` and committing the rebuilt static output (CI fails on drift).
3. **Arrows rule:** section-heading locale strings are plain text; the single styled `>` is rendered by the consumer. Terminal body lines keep `>` inside the string. Never both.
4. **Plyr is never unmounted** after init (removeChild crash) — only hidden.
5. **Python 3.14 local:** the Jinja2 `Environment` is built manually with `cache_size=0` in `main.py`. Do not "simplify".
6. **`/media/*` 404s locally are expected** (prod nginx serves them). VideoPlayer's fallback is the designed behavior.
7. **OG PNGs are generated** by screenshotting the HTML/SVG template at 1200×630 via Playwright — regenerate the same way, never hand-edit.
8. **No `?v=` query cache-busting on JS chunks, ever** (historic React error #321 / double React instance). Content hashes in filenames only. `resolve.dedupe` for react stays.
9. **File ownership:** a worker writes only the paths listed for its task in the Wave plan. Findings outside ownership go into the task report, not into edits.
10. **Shared-file protocol:** `backend/main.py` and `backend/templates/base.html` have exactly ONE designated writer per wave (see Wave plan). Any other agent needing a hook there leaves a `# WIRE(v4): ...` comment in its own files; the orchestrator applies the wiring at the gate.
11. **Copy is authored, not translated.** New RU/EN strings follow PRODUCT.md voice (plain-spoken, specific, no fearmongering; forbidden words list applies). RU is not a literal translation of EN.

---

## Multi-agent orchestration

### Roles

- **Orchestrator** (main session): dispatches one fresh subagent per task with the prompt contract below, owns all git commits, runs gates, performs I1, maintains this file's checkboxes.
- **Workers**: one per task row. Receive: Hard rules verbatim, their task section verbatim, the file-ownership list, relevant gotchas. They run their own task-local verification before reporting done.
- **Reviewers** (R1): four read-only agents — backend Python, frontend React/TS, templates/i18n/a11y, infra/CI — auditing the full `main..HEAD` diff. Verified findings only.
- **Verifier**: runs the Final verification checklist after R2.

### Wave plan & exclusive file ownership

Waves run sequentially. Tasks inside a wave run in parallel **only because their write-paths are disjoint**; W3 is an explicitly sequential chain (shared locale/util files).

| Wave | Task(s) | Agent | Exclusive write paths this wave |
|---|---|---|---|
| W0 | Baseline + metrics | orchestrator | `/tmp/dcm-v4-before/`, this plan |
| W1 | A1 bundle split | frontend-core | `frontend/vite.config.ts`, `frontend/src/main.tsx`, **`backend/templates/base.html` (designated)**, `backend/assets.py` (new), Dockerfile frontend stage, `backend/static/**` |
| W1 | A3 → A4 | backend-db | `backend/database.py`, `backend/routers/{pages,api}.py`, **`backend/main.py` (designated)**, `backend/tests/**` |
| W1 | A8 hygiene | hygiene | `backend/routers/game.py`, `frontend/src/components/CertificateWidget.tsx` |
| W1 | A5 git-LFS | infra-lfs | `.gitattributes`, `.github/workflows/ci-cd.yml` (checkout steps only), `scripts/deploy.sh` (lfs lines only), docs note |
| W1 | A6 nginx vhost | infra-nginx | `deploy/nginx/**` (new) |
| — | **Gate G1** | orchestrator | wiring of `WIRE(v4)` notes, pytest + tsc + build, commit |
| W2 | A2 i18n unify | frontend-i18n | `backend/locales/*.json`, `frontend/src/utils/i18n.ts`, `frontend/src/components/*` (BUNDLES removal), **`base.html` (designated)**, `scripts/i18n_audit.py` (new), `backend/i18n.py`, tests |
| W2 | O1 → O2 → F3 → A7 | backend-obs | **`backend/main.py` (designated)**, `backend/config.py`, `backend/routers/feeds.py` (new), `Dockerfile`, `docker-compose*.yml`, `scripts/deploy.sh` (probe), CI health-check steps, tests |
| W2 | F4 OG cards | tooling-og | `scripts/og_generate.py` + `scripts/og_template.html` (new), `backend/routers/pages.py` (page_image only), `backend/static/images/og/**` |
| — | **Gate G2** | orchestrator | gates + RU/EN screenshot sweep (A2 touches UI) |
| W3 | F1 → F2 → F5 (sequential) | feature crew (one subagent per task, in order) | F1: `database.py` (FTS), `routers/api.py`, `routers/pages.py`, `templates/search.html`, `components/SearchConsole.tsx`, locales. F2: `templates/check.html`, `components/MessageAnalyzer.tsx`, `frontend/src/data/redflags.ts`, vitest setup, locales. F5: `frontend/src/utils/progress.ts`, `components/CourseProgress.tsx`, locales |
| W3 | I1 integration | orchestrator | `base.html` (nav + head links), `components/MobileMenu.tsx`, nav locale keys |
| — | **Gate G3** | orchestrator | gates + screenshot sweep |
| W4 | Q1 E2E suite | qa-e2e | `e2e/**` (new), `playwright.config.ts`, CI `e2e` job, `scripts/e2e.sh` |
| W4 | R1 review ×4 → R2 fixes | reviewers / fixers | R2 fixers inherit ownership of the files they fix |
| — | **Gate G4** | verifier | Final verification checklist, update `HANDOFF.md` → v4 |

### Worker prompt contract

Every dispatched worker prompt contains: (1) Hard rules verbatim; (2) its task section verbatim; (3) its exclusive write-paths; (4) the relevant gotchas; (5) Definition of Done: *task checkboxes complete, task-local verify steps pass, `pytest -q` green, `npx tsc --noEmit` green if frontend touched, report lists every file changed + anything observed outside ownership.* Workers never commit, never push, never edit shared files outside designation.

### Gates (G1–G4)

- [ ] `backend/.venv/bin/python -m pytest -q` all green (count only grows).
- [ ] `cd frontend && npx tsc --noEmit && npm run build` clean; rebuilt `backend/static/` staged.
- [ ] Apply pending `WIRE(v4)` notes; grep confirms none remain.
- [ ] One commit per wave with a body listing task IDs.
- [ ] G2/G3 additionally: Playwright full-page screenshot sweep (RU/EN × desktop/mobile) vs `/tmp/dcm-v4-before/`; only intended diffs.

---

## Section A — Debt burn-down (from HANDOFF backlog, high → medium)

### Task A1: Bundle re-splitting — hashed chunks + Vite manifest

The inline bundle (`inlineDynamicImports: true`) ships Plyr + all course widgets on every page (~377 KB). Replace with real code-splitting; hashed filenames make the historic `?v=`/React-#321 failure mode structurally impossible.

**Files:** `frontend/vite.config.ts`, `frontend/src/main.tsx`, `backend/assets.py` (new), `backend/templates/base.html`, `Dockerfile` (frontend stage), tests.

- [ ] `vite.config.ts`: drop `inlineDynamicImports`; set `build.manifest: true`; `entryFileNames: 'js/[name]-[hash].js'`, `chunkFileNames: 'js/chunks/[name]-[hash].js'`, `assetFileNames` for hashed CSS. Keep `resolve.dedupe`.
- [ ] `main.tsx`: restore the `React.lazy` registry (per-island dynamic import). Suspense fallback re-renders the captured SSR `innerHTML` (no blank frame); existing ErrorBoundary behavior unchanged.
- [ ] `backend/assets.py`: load `static/.vite/manifest.json` once (memoized), expose `vite_entry()` → entry JS, CSS list, `modulepreload` imports. Leave `# WIRE(v4): register vite_entry as Jinja global` for the orchestrator (one line in `main.py`).
- [ ] `base.html`: replace the hardcoded `asset_url('js/app.js')`/CSS tags with manifest-driven tags + `<link rel="modulepreload">`. Keep `asset_url` (with its TTL memo) for images only.
- [ ] Old stable-name artifacts removed from `backend/static/js|css`; `.vite/manifest.json` committed (drift guard covers it).
- [ ] Verify: `npm run build`; serve; `/ru/` network log has **no** Plyr chunk, post page has it; console clean (no #321); pytest gets a test asserting home HTML references the manifest entry filename.

### Task A2: Unify island translations — single source of truth

Two sources (backend `locales/*.json` vs per-component `BUNDLES`/`STRINGS`) already drift (`mark_complete`); ~119 locale keys are dead.

**Files:** `backend/locales/en.json`, `backend/locales/ru.json`, `backend/i18n.py`, `frontend/src/utils/i18n.ts`, all islands with `BUNDLES`, `backend/templates/base.html`, `scripts/i18n_audit.py` (new), tests.

- [ ] `scripts/i18n_audit.py`: scan templates for `t(_lang, '…')` and `.tsx` for `t('…')`; print used/dead keys per surface. Pytest wrapper `test_no_dead_locale_keys` (with a small allowlist file for intentional keeps).
- [ ] Move every island string into a new top-level `"client"` namespace in BOTH locale files (`client.common`, `client.carousel`, `client.course`, …). `backend/i18n.py`: `get_client_bundle(lang)` returns that slice.
- [ ] `base.html` (designated writer this wave): inject `<script>window.__DISCAMMER_I18N__ = {{ client_i18n | tojson | forceescape }}</script>` before the app entry.
- [ ] `utils/i18n.ts`: `t(key, params)` reads the window bundle, keeps the `$&`-safe interpolation, console.warn + key-as-fallback on miss. Delete all `BUNDLES`/`STRINGS` from components.
- [ ] Delete dead keys per audit; add pytest `test_client_bundle_parity` (EN/RU `client.*` key sets identical).
- [ ] Verify: grep shows zero `BUNDLES`; RU/EN screenshots byte-identical text vs baseline; audit reports 0 dead keys.

### Task A3: DB connection per request

Each CRUD helper currently opens its own aiosqlite connection (home page = 4 connections/request).

**Files:** `backend/database.py`, `backend/routers/pages.py`, `backend/routers/api.py`, `backend/main.py` (designated), tests.

- [ ] `database.py`: `get_conn()` FastAPI dependency — one `aiosqlite` connection per request (row_factory + `busy_timeout` set once), closed on teardown. CRUD helpers become pure functions taking `conn`.
- [ ] Routers take `conn = Depends(get_conn)`; lifespan seed keeps its own connection.
- [ ] Test: monkeypatched `aiosqlite.connect` counter — `GET /en/` opens exactly 1 connection; `/api/posts` exactly 1.

### Task A4: Multi-worker seed guard

- [ ] Wrap `seed_database()`'s wipe+insert in an exclusive `fcntl.flock` on `data/.seed.lock`; add `SEED_ON_STARTUP` env (default `"1"`) in `config.py`.
- [ ] Test: two concurrent seeds (threads) serialize; row counts correct after both.

### Task A5: git-LFS for Unity binaries (~25 MB/version, history grows linearly)

- [ ] `.gitattributes`: track `backend/game_build/Build/*.br` (+ `*.data` if untracked variants exist); `git lfs migrate import --no-rewrite` for current files (no history rewrite).
- [ ] CI: `actions/checkout` gets `lfs: true` in every job that builds the Docker context.
- [ ] `deploy.sh`: `git lfs install --local` + `git lfs pull` after the `reset --hard`.
- [ ] **Owner action (blocks next push, not this work):** install `git-lfs` on the prod server.
- [ ] Verify: `git lfs ls-files` lists the binaries; local `docker compose up --build` still serves `/play/`.

### Task A6: nginx vhost into the repo

Config currently lives only on the server (TLS, `/media/` alias, proxy → :8000); a server rebuild loses it.

- [ ] `deploy/nginx/discammer.conf`: best-known reconstruction (server_name discammer.com, certbot include placeholders, `location /media/ { alias /opt/discammer/media/; }`, proxy_pass `127.0.0.1:8000`, HSTS, sane gzip). Mark reconstructed lines with `# RECONCILE:`.
- [ ] `deploy/nginx/README.md`: manual apply procedure (`nginx -t` → reload); explicitly **no** auto-sync from deploy.sh this round.
- [ ] **Owner action:** diff against the live file and reconcile.

### Task A7: Non-root container (executes inside backend-obs, W2, after O2)

- [ ] Dockerfile runtime stage: `ARG APP_UID=10001`, create `app` user, `chown /app`, `USER app`.
- [ ] `docker-compose.yml`: `user: "${APP_UID:-1000}:${APP_GID:-1000}"` so local dev matches the host owner of `./data`; `docker-compose.prod.yml` documents setting `APP_UID/APP_GID` after the one-time server `chown -R` (**owner action checkbox**).
- [ ] Verify locally: `docker compose up --build` → seed writes `data/discammer.db`, `/api/health` 200, HEALTHCHECK passes as non-root.

### Task A8: Hygiene pair

- [ ] `routers/game.py`: `/play/`, `/play/{path}` declared via `api_route(methods=["GET", "HEAD"])`; test `HEAD /play/` → 200, empty body, correct headers.
- [ ] `CertificateWidget.tsx`: legacy names saved by the old per-keystroke bug are treated as unconfirmed when `name.trim().length < 2` — confirm step shows instead of auto-certificate. No data migration needed.

---

## Section B — Observability & debug instrumentation

### Task O1: Structured request logging + request IDs

**Files:** `backend/main.py` (designated), `backend/config.py`, tests.

- [ ] Middleware: take/generate `X-Request-ID` (uuid4 hex), echo it on the response, log one line per request — method, path, status, `duration_ms`, `rid` — via `logging.getLogger("discammer")`.
- [ ] `LOG_FORMAT=json|text` env in `config.py` (json formatter for prod ingestion); plaintext-404 probe paths log at DEBUG (no noise); unhandled exceptions logged once with rid.
- [ ] Container CMD gets `--no-access-log` (uvicorn) to avoid duplicate lines.
- [ ] Tests: response carries `X-Request-ID`; caplog shows rid + duration on a normal GET.

### Task O2: `/api/health`

- [ ] New endpoint → `{"status":"ok","version":<GIT_SHA>,"db":"ok","posts":N,"guides":N,"modules":N}`; 503 on DB failure. `GIT_SHA` flows in as Docker build-arg → env (deploy.sh passes `git rev-parse --short HEAD`).
- [ ] Dockerfile HEALTHCHECK, deploy.sh rollback probe and CI health curls all switch to `/api/health` (page curls stay as smoke).
- [ ] Tests: 200 schema; counts > 0 after seed.

### Task F3: RSS feed (rides with backend-obs; same designated `main.py` writer)

- [ ] `routers/feeds.py`: `GET /feed.xml` — RSS 2.0, latest 30 posts (all types), absolute URLs via `SITE_ORIGIN`, RFC-822 dates via `email.utils.format_datetime`, escaping via `xml.sax.saxutils`.
- [ ] `_is_asset_path` / probe classifier: exact `/feed.xml` is served; `/feed.xml-old` stays plaintext 404 (test both).
- [ ] Tests: valid XML parse via `xml.etree`, item count, content-type `application/rss+xml`. `<link rel="alternate">` in head lands in **I1**, not here.

---

## Section C — New features (PRODUCT.md-driven)

### Task F1: Site search (SQLite FTS5)

The briefing room gets a query line. Search covers journal posts + guides.

**Files:** `backend/database.py`, `backend/routers/api.py`, `backend/routers/pages.py`, `backend/templates/search.html` (new), `frontend/src/components/SearchConsole.tsx` (new), locales (`client.search.*` + page keys), tests.

- [ ] Seed builds FTS: `CREATE VIRTUAL TABLE content_fts USING fts5(kind, slug, title, body, tokenize='unicode61 remove_diacritics 2')`; body is markdown stripped to plain text. Startup capability check: no FTS5 → `SEARCH_ENABLED=False`, helper falls back to `LIKE` (log a warning).
- [ ] `GET /api/search?q=&kind=&limit=` (limit cap 20): query terms quoted per-term (`"term"*`) — raw user input never concatenated into MATCH. Returns `{kind, slug, title, snippet_html}`; `snippet()` uses `\x01/\x02` markers, server HTML-escapes the text **then** swaps markers for `<mark>` (documented as the only sanctioned `dangerouslySetInnerHTML` field).
- [ ] `GET /{lang}/search`: SSR results when `?q=` present (same escape-then-mark via a Jinja filter), empty-state copy otherwise. Heading follows the arrows rule.
- [ ] `SearchConsole.tsx`: progressively enhances the SSR form — debounced fetch with cancellation, ↑/↓ result navigation, `aria-live="polite"` result count, Enter falls back to SSR submit.
- [ ] Tests: FTS row count == posts+guides after seed; "phishing" returns the right guide; `q` with quotes/`; DROP` is inert; snippet output contains no unescaped `<` from content.

### Task F2: «Проверка сообщения» — client-side red-flag analyzer

The flagship "install the pause" feature: paste a suspicious message, get the analyst read. **Text never leaves the browser** — say so in the UI. Tone per PRODUCT.md: оценка, не вердикт; no scolding.

**Files:** `backend/templates/check.html` (new), `backend/routers/pages.py` (route), `frontend/src/components/MessageAnalyzer.tsx` (new), `frontend/src/data/redflags.ts` (new), `frontend/vitest.config.ts` + `frontend/src/data/redflags.test.ts` (new), locales (`client.analyzer.*` + authored RU/EN page copy).

- [ ] `redflags.ts`: typed rule pack (≈18–24 rules), each `{id, severity 1–3, test(text), flagKey, guideSlug?}`. Coverage: urgency lexicon (RU+EN), OTP/credential asks, "safe account"/«безопасный счёт», impersonation (bank/police/boss), payment rails (crypto, gift cards, P2P), URL shorteners, punycode `xn--` + mixed Latin/Cyrillic lookalikes, prize/lottery, guaranteed-ROI pitches, QR mention, deadline pressure, secrecy asks.
- [ ] `MessageAnalyzer.tsx`: labeled textarea → explicit ANALYZE button (no on-input churn) → `aria-live="polite"` results: severity-weighted threat meter (reuse the ScamTypesGrid meter pattern incl. its aria-label rule), fired flags each linking to `/{lang}/guide/{slug}`, "first 60 seconds" CTA, privacy + heuristic-not-verdict lines. Reduced-motion safe.
- [ ] `check.html`: SSR explainer with one concrete worked example per language (authority by specificity); noscript fallback = static 60-second checklist (useful even without JS).
- [ ] Vitest wired (`npm test`, added to the CI frontend job): scam fixtures (RU+EN) fire expected flag IDs; a benign message fires none; punycode fixture fires.
- [ ] Verify: page screenshots both langs; flags link to existing guide slugs (assert against seeded slugs in a vitest fixture exported from a small generated JSON, or hardcode + e2e check).

### Task F5: Progress export/import («досье оперативника»)

LocalStorage-only progress deserves a backup path; no accounts.

**Files:** `frontend/src/utils/progress.ts`, `frontend/src/components/CourseProgress.tsx`, locales (`client.progress.*`), vitest tests.

- [ ] `exportProgress()` → versioned `{v:1, exportedAt, lessons, exams, certName}`; `importProgress(json)` → hand-rolled shape guards, **merge best-of** (lessons union, exam scores max, cert name kept if confirmed), returns a report `{addedLessons, improvedExams}`.
- [ ] `CourseProgress.tsx` footer: `[EXPORT_DOSSIER]` (Blob download `discammer-progress-YYYYMMDD.json`) + `[IMPORT]` file input → terminal-styled toast `// dossier merged: +N`, quiet red notice on invalid file. Merge-only, so no destructive confirm needed.
- [ ] Vitest: round-trip, corrupted JSON, downgrade attempt (`v:0`), merge keeps the better exam score.

### Task I1: Integration pass (orchestrator only)

- [ ] `base.html` head: `<link rel="alternate" type="application/rss+xml" href="{{ site_origin }}/feed.xml">`.
- [ ] Navigation: add CHECK (`/{lang}/check`) and SEARCH (`/{lang}/search`) per the DESIGN.md `nav-link` spec; extend the `aria-current` startswith map. If five desktop items crowd the header at 768–900px, SEARCH moves to MobileMenu + a journal-page affordance — decide against DESIGN.md, record the call here.
- [ ] `MobileMenu.tsx` links array + `nav.check` / `nav.search` locale keys (both langs).
- [ ] Rebuild, commit, screenshot sweep.

---

## Section D — QA: E2E debug harness in CI

### Task Q1: Playwright E2E suite

**Files:** `e2e/**` (new, repo root), `e2e/playwright.config.ts`, `.github/workflows/ci-cd.yml` (new `e2e` job), `scripts/e2e.sh`.

- [ ] Specs: `smoke` (every page 200, zero console errors, hydrated island count > 0), `nav` (aria-current correctness), `bundle` (Plyr chunk requested on post pages only; console has no React #321 text), `course` (unlock chain via seeded localStorage; exam best-of survives a failed retake), `analyzer` (fixture fires expected flags), `search` (query → result → navigate), `progress` (export → wipe → import → state restored), `i18n` (RU page shows `client.*` strings, no raw keys), `a11y` (axe-core on `/`, `/course`, `/check`, `/search`: 0 serious/critical), `motion` (reduced-motion emulation: hero animations off).
- [ ] CI `e2e` job: needs backend-tests + frontend-build → build image, `docker compose up -d`, wait on `/api/health`, run chromium-only, upload traces/screenshots on failure. `deploy` job gains `needs: e2e`.
- [ ] `scripts/e2e.sh` for local runs against compose.

---

## Section E — Review round & ship

- [ ] **R1:** four read-only reviewers over `main..HEAD` (backend / frontend / templates-i18n-a11y / infra). Verified findings only, prioritized security > correctness > a11y > performance > hygiene.
- [ ] **R2:** fix agents grouped by file ownership; gates re-run.
- [ ] Update `HANDOFF.md` → v4 state (what shipped, new gotchas: manifest pipeline, FTS rebuild, vitest, e2e job, LFS server prerequisite, remaining deferred items).

## Final verification (G4)

- [ ] `pytest -q` all green; count recorded below.
- [ ] `npm test` (vitest) green; `npx tsc --noEmit` + `npm run build` clean; rebuilt static committed; no `WIRE(v4)` markers left.
- [ ] Full e2e suite green locally against compose.
- [ ] Screenshot sweep (RU/EN × desktop/mobile × all pages incl. `/search`, `/check`) vs `/tmp/dcm-v4-before/` — only intended diffs.
- [ ] `git log` reviewed: one commit per wave + R2; **nothing pushed**.

## Metrics (fill W0 → G4)

| Metric | Before (W0) | After (G4) | Target |
|---|---|---|---|
| Home JS transferred | 376493 B (113.4 KB gzip), single `app.js` w/ Plyr+all widgets inlined | _TBD_ | no Plyr/course chunks on home |
| `app.js` size | 376493 B (`main.css` 99464 B) | _TBD_ | — |
| pytest count | 28 | _TBD_ | ≥ 45 |
| Vitest / e2e specs | 0 / 0 | _TBD_ | ≥ 12 / ≥ 10, all green |
| Dead locale keys | ~119 (431 keys/locale total; exact dead count measured in A2) | _TBD_ | 0 |
| Connections per home request | 4 | _TBD_ | 1 |
| axe serious/critical | n/a (not measured at W0) | _TBD_ | 0 |

**W0 baseline recorded 2026-06-12:** `pytest` 28/28 green · `npx tsc --noEmit` clean · `npm run build` clean, no `backend/static` drift · `app.js` 376493 B / `main.css` 99464 B · 431 locale keys per locale (en==ru). Baseline full-page screenshots in `/tmp/dcm-v4-before/`.

## Deferred to v5 (decided, with reasons)

- Accounts / server-side progress sync — export/import (F5) covers the need without auth surface.
- Analytics — nginx access logs + GoAccess on the server suffice for now; revisit privacy-first options later.
- Client error beacon endpoint — spam/abuse vector; ErrorBoundary + e2e console assertions cover it.
- Markdown render in threadpool — revisit only if content volume or TTFB says so.
- New content, comments, CMS, re-theming, framework migrations — out of scope, unchanged from v3.
