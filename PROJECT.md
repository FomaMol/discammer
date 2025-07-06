# DiScammer - technical and portfolio overview

**Last reconciled:** 2026-07-15 against revision `4682e35`
**Primary audience:** contributors, reviewers, and university-portfolio readers
**Project author:** Foma Molchanov
**Public portfolio dossier:** `/en/portfolio` and `/ru/portfolio`

## What DiScammer is

DiScammer is a bilingual, privacy-conscious anti-scam learning product. It
helps a reader pause, inspect a suspicious message or link, and learn the
recognition patterns behind phishing, social engineering, financial fraud,
account security, AI-enabled deception, and incident response.

The product combines a server-rendered site, an educational journal archive,
ten scam-type guides with a static official-source catalogue, a nine-module
course, two in-browser checking tools, and the separate Unity WebGL game
*Antifraud Hero*. It is not a bank, security operation, credential issuer, or
emergency recovery service.

The portfolio dossier identifies Foma Molchanov and explains the project in
plain language. Before an admissions submission, its authorship and tooling
disclosure require Foma's own reviewed account; this repository can evidence
implementation, but cannot independently prove personal authorship or learning
outcomes.

## Product boundaries and truthful wording

These limits are part of the product, not fine print:

- The message checker and link inspector run their analysis in the browser.
  Their input is not sent to a DiScammer analysis API.
- Course progress and the completion record are browser-local by default.
  Clearing browser storage or changing device can remove them. A learner may opt
  into sync, which stores a copy on the server — encrypted in the browser under a
  key derived from a code the server never receives, so the stored copy is
  ciphertext the server cannot read. That copy includes the name typed for the
  completion record: the protection is the encryption, not an absence of the
  name. There is no account, email, or password, and losing the code means losing
  that copy, because only the learner holds the key.
- The final self-assessment is untimed, unproctored, and unmonitored. The local
  completion record is not a verified credential, proof of identity, proof of
  competence, or an institutionally issued certificate.
- The journal is an archive, not an evidenced subscription or weekly publishing
  service.
- Guide sources are a static, checked-in catalogue of primary-source safety
  guidance. They support general educational advice, not a live threat feed,
  case investigation, verification of a reader's message, or a promise of
  recurring human review. Legal rights, reporting, and recovery routes depend
  on the reader's jurisdiction.
- "Local-first" does not mean that absolutely no operational data exists:
  normal web access logging, a privacy-scrubbed, sampled client-error signal,
  and an aggregate per-surface view counter are distinct from the checker input
  and local course record. The view counter is keyed only by a coarse surface
  name derived from the route template and the UI language, never by a slug,
  path, query, address, or any reader content; the checker and inspector are
  counted by surface name alone, and their text never leaves the browser.

The active record of wording decisions is
[`docs/portfolio/CLAIM_LEDGER.md`](docs/portfolio/CLAIM_LEDGER.md). It is an
internal governance document, not a public product page. Do not introduce a
public claim unless the ledger can point to implementation evidence or a named
primary source.

## Current, historically accurate scope

| Surface | Implemented repository content |
| --- | --- |
| Guides | 10 authored English/Russian Markdown pairs and 12 linked official primary-source entries, each with authored EN/RU scope and source notes |
| Journal | 8 interview, 8 newsletter, and 7 article English/Russian Markdown pairs |
| Course | 9 modules; 55 lesson JSON pairs (EN/RU) |
| Interactive tools | Local message checker and link inspector, each with a loadable onboarding example; their island code is precached, so a page already visited still opens offline |
| Learning record | Browser-local progress, self-assessment result, and printable personal record; optional sync of that record to other devices via a code, stored server-side only as client-encrypted ciphertext |
| Game | A separately served Unity WebGL build at `/play/` |

Content parity describes paired files and interface strings. The guide source
catalogue is reviewed repository content, not a claim of real-time editorial
monitoring, complete jurisdictional coverage, or user-research results.

## Architecture

### Request and rendering model

DiScammer uses FastAPI and Jinja2 for server-rendered HTML, with React used as
small interactive islands. `backend/main.py` mounts `/static`, creates the
Jinja environment, and includes four routers:

- `routers/pages.py` - localized SSR pages and compatibility redirects;
- `routers/api.py` - JSON content, health, search, and the versioned
  threat-rules feed under `/api`;
- `routers/game.py` - the Unity WebGL build under `/play/`;
- `routers/seo.py` - robots, sitemap, RSS feed, web manifest, the root-scope
  service worker at `/sw.js`, and the IndexNow key file.

The operational `/api` endpoints are registered directly on the application in
`backend/main.py` rather than in `routers/api.py`: a Prometheus exposition at
`/api/metrics` gated by bearer token or loopback, the client-error beacon at
`/api/client-errors`, and the CSP report sink at `/api/csp-report`. The
threat-rules feed is data only - it ships host and TLD lists to the in-browser
engines and never receives a reader's message or URL.

Root and legacy paths redirect to a language-prefixed page. The normal product
surface is `/en/...` or `/ru/...`, including home, journal, guides, course
modules and lessons, game, About, Portfolio, message check, link inspection,
and search. The complete route contract belongs to the router source and tests,
not this summary.

`frontend/src/main.tsx` registers 23 lazy React islands. On load, it finds
`[data-component]` mounts, reads JSON props, and hydrates only those mounts.
The server HTML is retained as the suspense and error fallback so an island
failure does not intentionally turn a reading surface into a blank box.

### Frontend assets

Vite builds into `backend/static/` and writes
`backend/static/.vite/manifest.json`. `backend/assets.py` resolves the hashed
entry, CSS, and static-import preload files at render time. Dynamic island
chunks load only when needed. Content-hashed filenames are the JavaScript and
CSS cache-busting mechanism; do not restore query-string cache busting for
these assets.

`backend/static/` is a committed build artifact. After frontend source or
template class changes, run the frontend build and include the updated static
assets and manifest in the same change.

### Service worker and offline behavior

`frontend/sw-src.js` is a template; `frontend/vite-plugin-sw.ts` substitutes the
version, precache list, and offline URL at build time and writes
`backend/static/sw.js`. Do not edit the generated file. The worker precaches the
app shell, self-hosted fonts, brand icons, the checker and inspector island
chunks, and a JavaScript-free `offline.html`.

Its caching rules are deliberate. Documents and navigations are network-first:
an online reader always gets the fresh document, and a cached copy is served
only when the network fails, falling back to `offline.html` for a page never
visited. Content-hashed bundles, fonts, and brand icons are cache-first. `/api/`
requests, `/sw.js`, and the `/play/` game bundle are never intercepted, so no
API or threat-rules response is ever served stale. Cache names carry a
content-derived version, and every cache outside the current allowlist is purged
on activate. Preserve this anti-stale contract: a stale document must never be
pinned.

### Content and storage

SQLite is the runtime content store (`data/discammer.db`). The schema includes
`post`, `scam_guide`, `course_module`, `lesson`, and a full-text-search index.
The content tables are derived state:

- guides, interviews, newsletters, and articles are Markdown files with flat
  front matter under `content/`;
- `content/provenance/guide-sources.json` maps every guide slug to one to three
  official primary sources plus authored EN/RU scope and source notes. During
  reseeding, it becomes locale-specific guide metadata exposed on the reading
  page and `/api/guides`;
- course module metadata is declared in `COURSE_MODULES` in
  `backend/seed_data.py`;
- course lessons are file-driven JSON under
  `content/course/{module_slug}/{lesson_slug}.{locale}.json`.

At startup, the application reseeds those derived content tables under a file
lock. Do not place user accounts, hosted progress, or any other durable user
state in tables that reseeding clears.

The schema also has one table that is **not** derived content: `sync_blob`, added
by UX-4. It holds opt-in, client-encrypted course progress keyed by a `blob_id`
the client derives from a secret the server never sees, so the rows are
ciphertext the application cannot read. It is deliberately absent from
`seed_database()`'s DELETE list and from `init_db()`'s column-drift DROP loop —
both are hardcoded allowlists over the derived content tables, and the table is
excluded by staying out of them. `backend/tests/test_db_lifecycle.py` pins both
exclusions, because a docstring promise that reseeding spares user state is only
worth what a failing test makes it worth. Never add `sync_blob` to a
`_*_REQUIRED_COLS` tuple: that path recovers from schema drift by dropping the
table, which is a correct strategy for content and a data-loss bug for progress.

## Design and localization

The active product authority is [`PRODUCT.md`](PRODUCT.md), and the active
visual authority is [`DESIGN.md`](DESIGN.md). The current design is a readable
"Field Office" rather than generic cyberpunk: the game can be more immersive,
while the website prioritizes calm, specific, accessible reading.

Both Russian and English are authored surfaces. Locale files live in
`backend/locales/`; `scripts/i18n_audit.py` checks key use, dead keys, and
EN/RU key parity. Keep language changes paired, and test mobile layouts with
Cyrillic rather than treating Russian as a post-implementation translation.

`DISCAMMER_REDESIGN_PLAN_v2.md` is retained only as a historical Tilda
migration and early-design record. It is not an active specification.

## Quality and operational status

### What the repository verifies

The repository contains 29 backend pytest modules, 13 frontend Vitest files, and
22 Playwright E2E specifications. CI also type-checks and builds the frontend,
checks committed static assets, runs dependency audits, and builds a Docker
image. The E2E workflow exercises the composed application and includes
accessibility and visual/performance checks described in the test tooling.

Useful local checks:

```bash
pytest -q
(cd frontend && npm test && npm run build)
python3 scripts/i18n_audit.py
```

On 2026-07-16, at the revision this documentation commit creates (parent
`14bfe41`), these commands were `locally verified` in the sense defined below:
`pytest -q` reported 246 passed, `npm test` reported 196 tests passing across 13
files, and `scripts/i18n_audit.py` exited cleanly with no dead keys, no missing
references, and EN/RU parity. The jump from the previously recorded 157 and 139
is UX-4's sync work and its tests, not a re-count of the same suites.

Those are local results on one machine. They are not a staging or production
check, and nothing on this revision is deployed. The Playwright E2E suite is run
by CI against the composed application and was not part of this local
reconciliation; UX-4's own cross-device E2E scenario is not written yet, so the
sync round-trip is currently evidenced by unit and API tests rather than by a
browser-level device change.

For a fresh local test environment, install `pytest` and `httpx` alongside the
runtime requirements:

```bash
python -m pip install -r requirements.txt pytest httpx
```

`httpx` is needed by FastAPI's test client; it is a test-environment
requirement, not a production runtime claim.

### Status vocabulary

Use these terms precisely in issues, portfolio copy, and release notes:

| Term | Meaning |
| --- | --- |
| `implemented` | Source code and its repository checks exist. |
| `locally verified` | A named command or local visual check passed on a stated revision. |
| `configured` | A configuration or runbook exists; this does not prove an external service is enabled. |
| `staging verified` | A named staging environment was checked. |
| `production verified` | A dated check against the deployed service passed. |

Do not turn `implemented` or `configured` into a production-security,
availability, educational-efficacy, or credential claim.

## Contributor workflow

```bash
# Backend tests from the repository root
python -m pip install -r requirements.txt pytest httpx
pytest -q

# Frontend tests and production build
cd frontend
npm ci
npm test
npm run build

# Locale contract audit from the repository root
python3 scripts/i18n_audit.py
```

For local backend development, start `main:app` from `backend/`; the module is
configured for sibling imports in that working directory. For end-to-end
development, use Docker Compose. The CI workflow is the current reference for
the complete production-like test sequence.

## Documentation map and authority order

When documents disagree, follow this order:

1. Executable code, schemas, tests, and generated build manifest;
2. [`PRODUCT.md`](PRODUCT.md) and [`DESIGN.md`](DESIGN.md) for product and
   visual intent;
3. [`docs/portfolio/CLAIM_LEDGER.md`](docs/portfolio/CLAIM_LEDGER.md) for
   public-claim limits and unresolved truth work;
4. [`FEATURE_PLAN.md`](FEATURE_PLAN.md) for future work, whose status labels
   are not production proof;
5. historical plans, handoffs, and reviews for context only.

The concise, tool-oriented version of this document is
[`CLAUDE.md`](CLAUDE.md). The admissions-facing repository guide is
[`docs/portfolio/README.md`](docs/portfolio/README.md). Rebuild
`PROJECT.pdf` with `scripts/generate-project-pdf.py` whenever this overview
changes materially, then render and inspect every PDF page before committing it.
