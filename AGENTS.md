# AGENTS.md

Guidance for contributors working on DiScammer.

## Product and sources of truth

DiScammer is a bilingual RU/EN anti-scam education platform. Its purpose is to
help people pause, verify through a trusted channel, and act safely when a
message, link, call, or offer feels wrong.

Read these before changing a user-facing surface:

1. `PRODUCT.md` defines audience, tone, privacy promise, and success metric.
2. `DESIGN.md` defines the current Field Office design system and accessibility
   requirements.
3. The live code, tests, and current `FEATURE_PLAN.md` outrank historical
   handoffs and redesign plans.

`DISCAMMER_REDESIGN_PLAN_v2.md`, older `docs/superpowers/plans/`, and prior
design reviews are historical records. They are not visual or product authority
when they conflict with `PRODUCT.md` or `DESIGN.md`.

## Commands

### Backend

Run the application from `backend/` so sibling imports resolve correctly:

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Install production and test dependencies in an isolated environment:

```bash
python -m pip install -r requirements.txt
python -m pip install pytest httpx
python -m pytest backend/tests
python scripts/i18n_audit.py
```

`httpx` is required by FastAPI's test client but is not yet declared in
`requirements.txt`; install it in the test environment until dependencies are
split into production and development requirement files.

### Frontend

Run from `frontend/`:

```bash
npm ci
npm test
npm run build
```

`npm run build` type-checks and writes the production manifest, hashed JS
chunks, and CSS to `backend/static/`. Those assets are committed deployment
artifacts. Do not edit files inside `backend/static/js`, `backend/static/css`,
or `backend/static/.vite` by hand.

### Full stack

```bash
docker compose up --build
```

## Architecture

- FastAPI renders the document shell with Jinja templates. React is used only
  for progressively enhanced islands.
- `backend/main.py` mounts `/static`, configures the Jinja environment, and
  includes the page and API routers.
- `backend/routers/pages.py` serves localized SSR routes for home, journal,
  posts, threat guides, course modules and lessons, game, message check, link
  inspection, search, about, and portfolio surfaces. Unprefixed legacy routes
  redirect to the detected language.
- `backend/routers/api.py` serves public JSON for content/search and operational
  endpoints. Do not send raw checker or inspector input to the API.
- `frontend/src/main.tsx` lazily hydrates elements marked with
  `data-component`. Adding an island requires its component, registry entry,
  Jinja mount point, locale strings when needed, tests, and a rebuilt frontend.
- Vite emits a content-hashed manifest. `backend/assets.py` resolves assets at
  render time, so do not reintroduce query-string cache busting or stable
  `app.js` assumptions.

## Content and state

- Markdown under `content/{guides,interviews,newsletters,articles}/` is the
  source of truth for journal and guide content.
- `content/provenance/guide-sources.json` is the checked-in, static source
  catalogue for every public guide. Keep its slug coverage and EN/RU
  `scope`, `title`, and `scope_note` fields complete. It supports general
  educational guidance; it is not a live threat feed, incident record, or a
  promise of a recurring editorial review. Use stable official primary-source
  URLs and run `pytest backend/tests/test_guide_provenance.py` after changing it.
- Course lessons are authored as paired RU/EN JSON files under `content/course/`.
- On startup, the SQLite tables holding derived editorial content are seeded
  from authored files. Do not store user-owned state in those reseeded tables.
- Course progress and the completion record are local-first browser state. Do
  not call them proctored, externally verifiable, or server-issued until a
  privacy-reviewed server-side credential system exists.
- `backend/locales/en.json` and `backend/locales/ru.json` must remain leaf-key
  parity. Run `python scripts/i18n_audit.py` after every locale change.

## Privacy, accessibility, and truthfulness

- Message checking and link inspection run in the browser. Preserve this
  privacy boundary; telemetry and error reports must never contain raw user
  messages or URLs.
- Keep keyboard navigation, visible focus, semantic landmarks, reduced-motion
  behavior, and RU/EN authored parity intact. Validate the mobile layout.
- Never publish fabricated statistics, unnamed investigator claims, recurring
  publication promises, completion credentials, or research outcomes. Mark
  examples, assumptions, and planned work clearly.
- The public portfolio dossier must distinguish Foma Molchanov's personal work,
  mentor support, and tooling assistance without inventing a biography, links,
  user-study results, or credentials.

## Delivery checklist

Before handing off a change, run the relevant backend tests, frontend tests,
production build, and i18n audit. Verify the changed RU and EN routes with and
without JavaScript where applicable. Do not deploy, push, or open a pull request
without explicit authorization.
