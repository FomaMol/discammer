# DiScammer - technical and portfolio overview

**Last reconciled:** 2026-07-13
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
- Course progress and the completion record are browser-local. Clearing browser
  storage or changing device can remove them.
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
  normal web access logging and a privacy-scrubbed, sampled client-error signal
  are distinct from the checker input and local course record.

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
| Interactive tools | Local message checker and link inspector |
| Learning record | Browser-local progress, self-assessment result, and printable personal record |
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
- `routers/api.py` - JSON data, health, search, metrics, and client-error
  endpoints under `/api`;
- `routers/game.py` - the Unity WebGL build under `/play/`;
- `routers/seo.py` - robots, sitemap, RSS feed, and web manifest.

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

The repository contains 21 backend pytest modules, 5 frontend Vitest files,
and 21 Playwright E2E specifications. CI also type-checks and builds the
frontend, checks committed static assets, runs dependency audits, and builds a
Docker image. The E2E workflow exercises the composed application and includes
accessibility and visual/performance checks described in the test tooling.

Useful local checks:

```bash
pytest -q
(cd frontend && npm test && npm run build)
python3 scripts/i18n_audit.py
```

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
