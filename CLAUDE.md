# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (run from `backend/`)
```bash
# Dev server (the venv is at backend/.venv, Python 3.14)
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Install/update Python deps (from repo root)
pip install -r requirements.txt
```

`main:app` must be imported from inside `backend/` — `main.py` prepends that directory to `sys.path` so sibling imports like `from database import ...` resolve. Running `uvicorn backend.main:app` from the repo root will break those imports.

### Frontend (run from `frontend/`)
```bash
npm install
npm run dev        # Vite dev server (for component iteration)
npm run build      # tsc type-check + Vite build — writes into ../backend/static/
npm run preview    # preview the built bundle
```

Vite's output directory is `../backend/static` with `emptyOutDir: false` — the build **overwrites** `backend/static/js/app.js` and `backend/static/css/main.css` in place. There is no separate `frontend/dist/`. After changing any React component you must rebuild for the FastAPI server to pick it up.

### Full stack
```bash
docker compose up --build    # builds frontend, then backend image, serves on :8000
```

### Tests
There is no test suite in this repo yet (only library-bundled `test_*.py` files under `backend/.venv/`).

## Architecture

DiScammer is a server-rendered FastAPI site with an **islands architecture** for interactivity — Jinja2 produces full HTML pages and React only hydrates marked elements.

### Request flow
1. `backend/main.py` builds the `FastAPI` app, mounts `/static`, attaches Jinja2 to `app.state.templates`, and includes two routers.
2. `routers/pages.py` serves SSR HTML at `/`, `/journal`, `/journal/{slug}`, `/guide/{slug}`, `/course`, `/game`. Markdown content from the DB is converted to HTML server-side via `markdown_renderer.render_markdown` and injected into templates.
3. `routers/api.py` serves JSON under `/api/posts`, `/api/guides`, `/api/course/modules` for the React islands that need to fetch additional data client-side.
4. All pages extend `templates/base.html`, which loads `/static/css/main.css` and `/static/js/app.js`.

### Islands hydration
`frontend/src/main.tsx` is the single entry point that bundles to `static/js/app.js`. On `DOMContentLoaded` it scans the DOM for `[data-component]` elements, looks up the name in its lazy-loaded `components` registry, parses `data-props` JSON, and mounts the React component into the element via `createRoot` (preserving the server-rendered `innerHTML` as `dangerouslySetInnerHTML` for fallback content).

**Adding a new interactive widget requires three changes:** add the `.tsx` component under `frontend/src/components/`, register it in the `components` map in `main.tsx`, and emit `<div data-component="Name" data-props='...'></div>` from a Jinja template. Then rebuild the frontend.

### Data layer
SQLite (via `aiosqlite`) with three tables defined inline in `backend/database.py`: `post` (interviews/newsletters/articles distinguished by `type`), `scam_guide`, `course_module`. The DB file is `data/discammer.db` (gitignored, persisted via the docker-compose `./data` volume).

`init_db()` creates tables; `seed_database()` runs on FastAPI startup via the lifespan hook and **wipes + reinserts the `post`, `scam_guide`, and `course_module` tables on every startup** so edits to markdown frontmatter or body flow through on the next container restart. Safe because those tables hold derived content only — no user-generated state.

### Content pipeline
Markdown files in `content/{guides,interviews,newsletters,articles}/` are the source of truth for posts and guides. `seed_data.py` parses YAML-like frontmatter using a hand-rolled regex (not PyYAML — only flat key/value pairs and integer coercion are supported; no nested structures, no lists) and inserts rows. Course modules are hardcoded in `COURSE_MODULES` in `seed_data.py`, not file-driven.

Frontmatter fields used by the seeder: `slug`, `title`, `subtitle`/`description`, `type`, `icon`, `threat_level`, `category`, `cover_image`, `published_at`. For interview/newsletter/article files, `type` defaults to the subdirectory name with a trailing `s` stripped if omitted.

### Styling
TailwindCSS v4 via the `@tailwindcss/vite` plugin. `frontend/src/styles/globals.css` declares the design tokens (cyberpunk palette: `#0B0E17` bg, `#00F0FF` cyan accent, `#39FF6B` green, `#FF4757` red, `#FFB547` amber) inside `@theme`. The `@source "../../../backend/templates/**/*.html"` directive tells Tailwind v4 to scan Jinja templates so utility classes used only in `.html` files aren't purged.

### Known workaround
`main.py` builds the Jinja2 `Environment` manually with `cache_size=0` and passes it to `Jinja2Templates(env=...)` — this is a deliberate workaround for a Python 3.14 + Jinja2 `LRUCache` incompatibility. Don't "simplify" it back to `Jinja2Templates(directory=...)`.

## Design plan

`DISCAMMER_REDESIGN_PLAN_v2.md` is the authoritative spec (Russian) for the visual redesign and content migration from the original Tilda site. Consult it when adding pages, components, or content — it documents the target design tokens, content inventory, and component requirements.
