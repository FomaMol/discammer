# DiScammer v5 — Hardening stage: non-root + WCAG-AA, Observability v2, three comprehension features

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Per-task TDD via `superpowers:test-driven-development`; debug via `superpowers:systematic-debugging` (+ `condition-based-waiting` for any e2e flake); review via `superpowers:requesting-code-review` / `receiving-code-review`; ship via `superpowers:finishing-a-development-branch`. Steps use checkbox (`- [ ]`) syntax. Mandatory pre-read for the orchestrator AND every dispatched worker: the **Hard rules** section below, plus `HANDOFF.md` (the **v4 gotchas are binding** — they describe traps that already bit us once), `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`. Spec lineage: `docs/superpowers/plans/2026-06-12-v4-feature-plan.md` → this plan.
>
> Target location in repo: `docs/superpowers/plans/2026-06-19-v5-feature-plan.md`.

**Starting state (from HANDOFF.md, after v4):** branch **`v4-features`** (off `main`@`56a2bef`), 4 unpushed v4 commits over 6 v3 commits, clean tree. `pytest 69`, `vitest 36`, `e2e 44` (chromium), `tsc`+`build` clean, `backend/static` drift-free, i18n-audit clean (en==ru parity, 0 dead / 0 missing). **Nothing pushed. `git push` to `main` = prod deploy (discammer.com).**

**Branching:** v4 is not yet on `main`. **Cut `v5-features` from the current `v4-features` HEAD (`8145095`)**, not from `main`. v5 commits stack on top of v4. The owner decides separately when (and in what order) v4+v5 land on `main`. Record the exact base SHA in W0.

**Goal:** Pay down the entire **"Deferred to v5"** ledger from the v4 handoff — non-root container (A1), WCAG-AA muted-text contrast (A2), markdown off the event loop (A3) — plus add supply-chain auditing (A4); deepen observability with a privacy-safe client error beacon (O1), RED metrics (O2), and a post-deploy prod smoke (O3); and ship three features that extend PRODUCT.md's core job ("install the pause") right where users already are: a per-guide knowledge check (F1), a client-side link/URL inspector (F2), and a shareable verdict card on the analyzer (F3). Automate the two QA rituals we've been doing by hand since v3 — visual regression and Lighthouse budgets (Q1, Q2).

**Architecture:** unchanged — SSR Jinja2 + React islands; every new surface = Jinja template + `data-component` island + `client.*` locale keys, served via the v4 hashed-chunk manifest pipeline (`backend/assets.py` → `vite_entry`). No build-system changes this round. The two structurally-sensitive items are A1 (a new container entrypoint) and A2 (a global token shift); both are deliberately self-contained and gated.

**Tech Stack:** FastAPI / Jinja2 / aiosqlite (+ SQLite FTS5), React 18 + TS + Vite 6 (`base:'/static/'`, manifest) + Tailwind v4, pytest, Vitest, Playwright `@playwright/test` + `@axe-core/playwright` (E2E in CI), GitHub Actions + docker compose deploy. **New this round:** `pip-audit` + `npm audit` (CI), Playwright `toHaveScreenshot` visual baselines, `@lhci/cli` (Lighthouse CI), `gosu`/`su-exec` (container entrypoint).

---

## Orchestration progress log (maintained by orchestrator)

- **W0 baseline** ✅ — record: `pytest` 69, `vitest` 36, `e2e` 44, `tsc`+`build` clean, `backend/static` drift-free, i18n-audit clean. Full-page screenshots of every page (RU/EN × desktop/mobile, **incl. `/search` and `/check`**) → `/tmp/dcm-v5-before/`. Measure and record the **current contrast ratios** of the muted tokens (`#475064`, `#6b7588`) against the real canvas value from DESIGN.md (these become the A2 "before" numbers). Note that the v4 axe config **excludes `color-contrast`** — A2 removes that exclusion. Fill the Metrics "Before" column. Record `v5` base SHA (`8145095`) and work branch `v5-features`.
- **W1** ⬜ — A1 (non-root container) + A3 (markdown off-loop). Gate G1.
- **W2** ⬜ — A2 (WCAG-AA tokens) + A4 (supply-chain audit) + O1/O2 (error beacon + RED metrics). Gate G2 (+ RU/EN sweep; A2 intentionally shifts every muted-text colour).
- **W3** ⬜ — F1 → F2 → F3 (sequential feature chain) + I1 nav integration. Gate G3.
- **W4** ⬜ — Q1/Q2 (visual regression + Lighthouse) + R1 four reviewers → R2 fixes. Gate G4.
- **G4** ⬜ — final verification, Metrics "After" filled, `HANDOFF.md` → v5.

### Owner actions (carried + new; none block the v5 work itself)
1. **git-lfs on prod + `git lfs migrate`** — still pending from v4 (`docs/deploy/git-lfs.md`). Non-blocking; `deploy.sh` skips the lfs lines if git-lfs is absent. Do it before the repo grows more `.br` versions.
2. **nginx vhost reconcile** — still pending from v4; diff `deploy/nginx/discammer.conf` against the live config, reconcile every `# RECONCILE:` line, `nginx -t`, reload.
3. **No manual data-volume chown needed (A1).** The non-root entrypoint chowns `/app/data` as root then drops privileges, so the deploy stays hands-off. This is the whole reason A1 is shaped as an entrypoint and not a bare `USER` directive.
4. **`METRICS_TOKEN` (O2)** — if `/api/metrics` is to be scraped from outside the box, set `METRICS_TOKEN` on prod; otherwise the endpoint stays bound/token-gated and returns 404 to the public.

---

## Hard rules (binding for the orchestrator and every worker)

Rules 1–11 carry over from v4 verbatim; **12–16 are new for v5.** Workers receive this whole block.

1. **NEVER `git push`.** Push to `main` triggers CI deploy to prod (discammer.com). All commits stay local; pushing is an explicit owner decision.
2. **`backend/static/` is a committed Vite artifact.** Any change under `frontend/src` requires `npm run build` and committing the rebuilt static output (CI fails on drift). The committed `.vite/manifest.json` is part of this.
3. **Arrows rule:** section-heading locale strings are plain text; the single styled `>` is rendered by the consumer. Terminal body lines keep `>` inside the string. Never both.
4. **Plyr is never unmounted** after init (removeChild crash) — only hidden.
5. **Python 3.14 local:** the Jinja2 `Environment` is built manually with `cache_size=0` in `main.py`. Do not "simplify".
6. **`/media/*` 404s locally are expected** (prod nginx serves them). VideoPlayer's fallback is the designed behavior.
7. **OG PNGs are generated** by screenshotting the HTML/SVG template at 1200×630 via Playwright — regenerate the same way, never hand-edit.
8. **No `?v=` query cache-busting on JS chunks, ever** (historic React #321 / double React instance). Content hashes in filenames only; `resolve.dedupe` for react stays; `base:'/static/'` in `vite.config` stays (without it the manifest preload helper double-fetches chunks).
9. **File ownership:** a worker writes only the paths listed for its task in the Wave plan. Findings outside ownership go into the task report, not into edits.
10. **Shared-file protocol:** `backend/main.py`, `backend/templates/base.html`, and `.github/workflows/ci-cd.yml` have exactly ONE designated writer per wave (see Wave plan). Any other agent needing a hook there leaves a `# WIRE(v5): …` comment **in its own files**; the orchestrator applies the wiring at the gate.
11. **Copy is authored, not translated.** New RU/EN strings follow PRODUCT.md voice (plain-spoken, specific, no fearmongering; forbidden-words list applies). RU is not a literal translation of EN. New island strings live in the `client.*` namespace in **both** locale files (the v4 single-source-of-truth model); never reintroduce per-component `BUNDLES`/`STRINGS`.
12. **Privacy invariant (analyzer family).** Pasted message text (F3) and pasted URLs (F2) **never leave the browser** and **never appear in any generated artifact**. The verdict card (F3) renders only counts, severity, and flag *categories* — never a substring of the user's message. The error beacon (O1) payload is scrubbed of any user-entered content. Say "stays in your browser" in the UI where relevant. A vitest test asserts no message text reaches card data.
13. **`/api/metrics` and the error beacon never expose or log PII or user content.** Metrics is access-gated (`METRICS_TOKEN` or internal bind; public gets 404). The beacon is **sampled + rate-limited + body-size-capped**, stores nothing, and only structured-logs `{rid, name, message-class, ua-family}` after stripping. No request bodies, no full query strings with user content, ever, in logs or metrics.
14. **The non-root entrypoint (A1) is "done" only when CI's dockerized `e2e` job proves it.** Docker is **not** available in the dev env — that is exactly why v4 reverted non-root. CI is the only validation path: the entrypoint must `chown /app/data` as root, drop to the app uid (gosu/su-exec), seed `discammer.db`, and pass `/api/health` 200, **inside the e2e job**, before A1 is checked off. If you cannot make the e2e job exercise it, A1 is not done.
15. **The WCAG-AA token change (A2) is atomic and global.** Bumping the muted tokens shifts muted-text colour on **every** page — that is expected, not a regression. In the *same* change, flip the e2e axe config to **stop excluding `color-contrast`** (no half-state where tokens move but the gate stays off). Re-run the full RU/EN sweep; the only diffs allowed are muted-text colour shifts.
16. **Don't "fix" the v4 gotchas backwards.** Specifically: `forceescape` must NOT appear inside `<script>` (it HTML-escapes JSON and breaks the literal) — the bundle/i18n inject in `base.html` uses `| tojson` only; `tojson | forceescape` is correct **only** inside `data-*` attributes. Nested i18n groups (`client.*.*`) are merged recursively by `get_client_bundle` and traversed by dotted keys in `makeTranslator` — keep the nesting. Ternary i18n keys are invisible to the audit scanner — write literal `tr('a')` / `tr('b')` per branch, never `tr(cond?'a':'b')`. `.gitignore` keeps the `/data/` anchor (bare `data/` swallowed `frontend/src/data/`).

---

## Multi-agent orchestration

### Roles

- **Orchestrator** (main session): cuts `v5-features`, dispatches one fresh subagent per task with the prompt contract below, owns all git commits, runs gates, performs I1, maintains this file's checkboxes and the progress log.
- **Workers**: one per task row. Receive Hard rules verbatim, their task section verbatim, their exclusive write-paths, and the relevant gotchas. They run their own task-local verification before reporting done. Workers never commit, never push, never edit shared files outside designation.
- **Reviewers** (R1): four read-only agents — backend Python, frontend React/TS, templates/i18n/a11y, infra/CI — auditing the full `8145095..HEAD` diff. Verified findings only, prioritized security > correctness > a11y > performance > hygiene.
- **Verifier**: runs the Final verification checklist after R2.

### Wave plan & exclusive file ownership

Waves run sequentially. Tasks inside a wave run in parallel **only because their write-paths are disjoint**. W3 is an explicitly sequential chain (the features share `locales/*.json`, `progress.ts`, and `MessageAnalyzer.tsx`).

| Wave | Task(s) | Agent | Exclusive write paths this wave |
|---|---|---|---|
| W0 | Baseline + metrics + contrast measurement | orchestrator | `/tmp/dcm-v5-before/`, this plan |
| W1 | A1 non-root container | infra-runtime | `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `scripts/docker-entrypoint.sh` (new), `scripts/deploy.sh`, **`.github/workflows/ci-cd.yml` (designated)** |
| W1 | A3 markdown off-loop | backend-perf | `backend/markdown_renderer.py`, `backend/routers/{pages,api}.py` (call sites only), **`backend/main.py` (designated)**, `backend/tests/**` |
| — | **Gate G1** | orchestrator | apply `WIRE(v5)` notes, pytest + tsc + build, commit |
| W2 | A2 WCAG-AA tokens | design-a11y | `frontend/src/styles/globals.css`, `frontend/tailwind.config.ts`, **`backend/templates/base.html` (designated)**, `e2e/specs/a11y.spec.ts` (axe config only), `backend/static/**` |
| W2 | A4 supply-chain audit | infra-ci | **`.github/workflows/ci-cd.yml` (designated)**, `requirements.txt` + `requirements-dev.txt` (pin bumps only), `frontend/package.json` (audit script), `docs/deploy/security-audit.md` (new) |
| W2 | O1 → O2 | backend-obs | **`backend/main.py` (designated)**, `backend/config.py`, `backend/metrics.py` (new), `frontend/src/main.tsx` (ErrorBoundary beacon call), `frontend/src/utils/beacon.ts` (new), `backend/tests/**` |
| — | **Gate G2** | orchestrator | gates + RU/EN sweep (A2 shifts every muted-text colour — expected) |
| W3 | F1 → F2 → F3 (sequential) | feature crew (one subagent per task, in order; **designated `main.py` + `base.html` writer for this wave**) | F1: `backend/templates/guide.html`, `frontend/src/components/KnowledgeCheck.tsx` (new), `frontend/src/data/quizzes.ts` (new), `frontend/src/utils/progress.ts`, `client.quiz.*` locales, vitest. F2: `backend/templates/inspect.html` (new), `backend/routers/pages.py` (route), `backend/main.py` (route reg), `frontend/src/components/LinkInspector.tsx` (new), `frontend/src/data/url_heuristics.ts` (new), `client.inspect.*` locales, vitest. F3: `frontend/src/components/VerdictCard.tsx` (new), `frontend/src/components/MessageAnalyzer.tsx`, `client.analyzer.card.*` locales, vitest |
| W3 | I1 integration | orchestrator | `base.html` (nav + INSPECT link), `frontend/src/components/MobileMenu.tsx`, `nav.*` locale keys |
| — | **Gate G3** | orchestrator | gates + screenshot sweep |
| W4 | Q1 visual regression + Q2 Lighthouse | qa-crew | `e2e/specs/visual.spec.ts` (new), `e2e/visual.config.ts` + committed baselines `e2e/**/*-snapshots/**` (new), `lighthouserc.json` (new), **`.github/workflows/ci-cd.yml` (designated)**, `scripts/lhci.sh` (new) |
| W4 | R1 review ×4 → R2 fixes | reviewers / fixers | R2 fixers inherit ownership of the files they fix |
| — | **Gate G4** | verifier | Final verification checklist, update `HANDOFF.md` → v5 |

### Worker prompt contract

Every dispatched worker prompt contains: (1) Hard rules 1–16 verbatim; (2) its task section verbatim; (3) its exclusive write-paths; (4) the relevant gotchas (esp. the v4 set in HANDOFF.md); (5) Definition of Done: *task checkboxes complete, task-local verify steps pass, `pytest -q` green, `npm test` (vitest) green if frontend logic touched, `npx tsc --noEmit` + `npm run build` green and `backend/static` rebuilt+staged if `frontend/src` touched, report lists every file changed + anything observed outside ownership.* Workers never commit, never push, never edit shared files outside designation; cross-file hooks go in a `# WIRE(v5):` comment in the worker's own file.

### Gates (G1–G4)

- [ ] `backend/.venv/bin/python -m pytest -q` all green (count only grows).
- [ ] `npm test` (vitest) green; `cd frontend && npx tsc --noEmit && npm run build` clean; rebuilt `backend/static/` staged (incl. `.vite/manifest.json`).
- [ ] Apply pending `WIRE(v5)` notes; `grep -rn "WIRE(v5)"` confirms none remain.
- [ ] One commit per wave with a body listing task IDs.
- [ ] G2/G3 additionally: Playwright full-page screenshot sweep (RU/EN × desktop/mobile × all pages incl. `/inspect`) vs `/tmp/dcm-v5-before/`. **G2 expects muted-text colour diffs everywhere (A2) and nothing else.**

---

## Section A — Debt burn-down (the v5-deferred ledger)

### Task A1: Non-root container (the v4 revert, done right)

v4 shipped as **root** because a bare `USER app` broke both the CI `e2e` job and prod: the bind-mounted `data/` is root-owned on the host, so a non-root process can't create `discammer.db` → seed fails → `/api/health` 503 → rollback. The fix is a **root entrypoint that fixes ownership, then drops privileges** — and it is only "done" when CI proves it (Hard rule 14).

**Files:** `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `scripts/docker-entrypoint.sh` (new), `scripts/deploy.sh`, `.github/workflows/ci-cd.yml` (designated this wave).

- [ ] `scripts/docker-entrypoint.sh`: runs as root; `chown -R "${APP_UID:-10001}:${APP_GID:-10001}" /app/data` (the only writable path); then `exec gosu "${APP_UID}:${APP_GID}" "$@"` (or `su-exec` for Alpine) to drop to the app user and hand off to uvicorn. Idempotent; tolerates an already-correct `data/`.
- [ ] `Dockerfile` runtime stage: install `gosu` (Debian) or `su-exec` (Alpine slim); `ARG APP_UID=10001` / `ARG APP_GID=10001`; create the `app` user/group; copy + `chmod +x` the entrypoint; `ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]`, `CMD ["uvicorn", …, "--no-access-log"]` (keep the v4 `--no-access-log`). **The image still starts as root** so the entrypoint can chown; the *process* ends up non-root. HEALTHCHECK unchanged (`/api/health`).
- [ ] `docker-compose.yml`: pass `APP_UID`/`APP_GID` build args defaulting to the host dev user; `docker-compose.prod.yml`: document that prod uses the default `10001` and needs **no** manual chown (the entrypoint handles it).
- [ ] `scripts/deploy.sh`: no manual `chown` step; ensure the rollback `:prev` retag path is unaffected by the entrypoint.
- [ ] **`.github/workflows/ci-cd.yml` — the proof (Hard rule 14):** in the `e2e` job, after `docker compose up -d`, assert the running container's process is non-root, e.g. `docker compose exec -T web id -u` returns `10001` (not `0`), **and** `/api/health` is 200 and reports `db: ok` with seeded counts. This is the gate that makes A1 real.
- [ ] Verify: CI `e2e` job green with the non-root assertion; `/play/` still serves (binaries readable by the app user); seed writes `data/discammer.db` under the app uid.

### Task A2: WCAG-AA muted-text contrast (token shift)

The muted-grey palette (`#475064`, `#6b7588` on the dark canvas) **fails WCAG AA** — a known design-token debt the v4 a11y-e2e only worked around by excluding `color-contrast` from axe. v5 closes it. This is a **design task**: re-derive the muted scale to meet AA while staying on-brand (analyst-briefing-room, no neon, no new hues), then enforce it.

**Design note (read first):** consult `DESIGN.md` for the canonical canvas/ink tokens and the "muted carries hierarchy, not decoration" intent, and the uploaded reference systems for muted-on-dark proof points that *do* pass AA — `raycast_DESIGN.md` (`mute #9c9c9d`, `ash #6a6b6c` on `#07080a`), `voltagent_DESIGN.md` (`mute #8b949e` on `#101010`), `warp_DESIGN.md` (`mute #aea69c` on `#2b2622`). The pattern: muted body text on a near-black canvas lands around L\* ≈ 60–65, not 40. **Do not invent a new accent** — only lift the greys.

**Files:** `frontend/src/styles/globals.css`, `frontend/tailwind.config.ts`, `backend/templates/base.html` (designated; only if muted tokens are declared as inline CSS vars there), `e2e/specs/a11y.spec.ts` (axe config), `backend/static/**` (rebuild).

- [ ] Introduce/retune a two-tier muted scale and replace literal hex usages (`text-[#475064]`, `text-[#6b7588]`, etc.) with the tokens:
  - `--ink-muted` (muted **body/label text** — must clear **4.5:1** vs canvas): target ≈ `#8b94a8` (verify against the real canvas value).
  - `--ink-dim` (**large text & non-text UI**: the aria-hidden `>` arrow, hairline-adjacent glyphs — must clear **3:1**): target ≈ `#6b7588` (the current lighter grey is already near the 3:1 line; confirm or nudge up).
  - **Retire `#475064` for any text or meaningful-glyph use** (it fails even 3:1). If a purely decorative divider needs it, that's non-text and only needs 3:1 against its neighbour — nudge to ≥ `#5b6678`.
- [ ] Verify **every** chosen value with a contrast checker against the actual DESIGN.md canvas token(s) (the briefing panels sit on slightly different darks — check each surface a muted token appears on, not just the page background). Record the before/after ratios in the Metrics table.
- [ ] `e2e/specs/a11y.spec.ts`: **remove the `color-contrast` exclusion** from the axe run on `/`, `/course`, `/check`, `/search` (and add `/inspect` once F2 lands — leave a `WIRE(v5)` note for the orchestrator to add that page to the axe list at G3). Expect 0 serious/critical incl. contrast.
- [ ] `npm run build`, commit rebuilt static. Verify: RU/EN sweep shows muted text legibly lighter everywhere and **nothing else** changed; axe contrast passes.

### Task A3: Markdown render off the event loop

Markdown→HTML is CPU-bound and currently runs synchronously inside async handlers (HANDOFF backlog #11). Move it off the loop so a content-heavy guide can't stall the worker.

**Files:** `backend/markdown_renderer.py`, `backend/routers/pages.py`, `backend/routers/api.py` (call sites), `backend/main.py` (designated; only if a shared executor/config is added), `backend/tests/**`.

- [ ] Wrap the synchronous render in `starlette.concurrency.run_in_threadpool` at each call site (post + guide rendering), **or** (preferred if low-risk) pre-render markdown→HTML once at **seed time** and store the HTML alongside the markdown, so request handlers serve cached HTML and the threadpool path is only the fallback. Pick one; document the choice and why in the task report. Keep the v4 sanitizer allowlist (`data-component`/`data-props` on `div` only) intact on whichever path renders.
- [ ] Preserve the `_strip_duplicate_h1` behavior and the island-mount markers; the FTS body (plain-text-stripped) is unaffected.
- [ ] Test: a guide page still renders identical HTML (byte-compare a fixture before/after); a synthetic large-markdown fixture renders without blocking a concurrent `/api/health` (assert both respond); sanitizer test still passes.

### Task A4: Supply-chain audit in CI

CI is mature (tests, type-check, build-drift, e2e); add dependency auditing so a known-vuln dependency fails the pipeline, not prod.

**Files:** `.github/workflows/ci-cd.yml` (designated this wave), `requirements.txt`, `requirements-dev.txt` (pin bumps only if the audit flags something), `frontend/package.json` (audit script), `docs/deploy/security-audit.md` (new).

- [ ] CI `audit` job (needs nothing; runs in parallel with tests): `pip-audit -r requirements.txt -r requirements-dev.txt` and `npm audit --omit=dev --audit-level=high` (frontend). Fail on **high/critical**; moderate is reported but non-blocking (documented threshold). Pin the audit tool versions.
- [ ] If the audit flags a current pin, bump to the nearest safe version, re-run `pytest`/`tsc`/`build`, and note the bump. Do **not** widen pins to ranges (the v3 exact-pin policy stays).
- [ ] `docs/deploy/security-audit.md`: the policy (thresholds, how to triage, how to add a justified, time-boxed ignore). Verify: `audit` job green on the current tree (or green after a justified bump).

---

## Section O — Observability v2

### Task O1: Privacy-safe client error beacon

v4 deferred this as a "spam/abuse vector." v5 ships it **with the mitigations that make it safe** (Hard rules 12, 13): the existing `main.tsx` ErrorBoundary already catches island crashes and restores SSR — now it also reports a scrubbed signal so we learn about real client breakage instead of guessing.

**Files:** `frontend/src/main.tsx` (ErrorBoundary), `frontend/src/utils/beacon.ts` (new), `backend/main.py` (designated this wave — route + handler), `backend/config.py`, `backend/tests/**`.

- [ ] `frontend/src/utils/beacon.ts`: `reportClientError({name, message, stack})` → **client-side scrub** (truncate message to ~200 chars, drop anything that looks like pasted user content, keep only the error class + a coarse location), **sample** (e.g. 20% via `Math.random`), and POST a tiny JSON to `/api/client-errors` with `navigator.sendBeacon` (no `await`, fire-and-forget, never blocks UI). No-op if `navigator.sendBeacon` is absent.
- [ ] `main.tsx`: ErrorBoundary `componentDidCatch` calls `reportClientError` (behavior otherwise unchanged — still re-injects captured SSR `innerHTML`). A `WIRE(v5)` note is **not** needed here (own file).
- [ ] `backend/main.py`: `POST /api/client-errors` — **body-size-capped** (reject > ~2 KB → 413), **rate-limited per IP** (in-memory token bucket; over limit → 429, no log spam), stores **nothing**, structured-logs one line `{rid, name, message_class, ua_family}` at `INFO` after a server-side re-scrub (defense in depth; never logs the raw message or any field that could carry user text). Returns 204.
- [ ] `backend/config.py`: `CLIENT_ERROR_SAMPLE_RATE` (default surfaced to the client via the existing config-injection path) and `CLIENT_ERROR_RATE_LIMIT`.
- [ ] Tests: oversized body → 413; flood → 429 after N; a normal report → 204 and caplog shows the scrubbed line with **no** message body; payload with a fake "pasted message" field is dropped/ignored.

### Task O2: RED metrics endpoint (`/api/metrics`)

v4 gave per-request structured logs and `/api/health`. v5 adds aggregate **R**ate/**E**rrors/**D**uration so the box is observable without log-scraping — access-gated so it's not a public surface (Hard rule 13).

**Files:** `backend/metrics.py` (new), `backend/main.py` (designated this wave — middleware hook + route), `backend/config.py`, `backend/tests/**`.

- [ ] `backend/metrics.py`: a tiny dependency-free Prometheus **text exposition** collector — request counter (by method, route-template, status-class), an error counter, and a duration histogram (a few fixed buckets). Fed from the **existing** v4 request-logging middleware (extend it; don't add a second middleware) so route + status + duration are recorded once.
- [ ] `backend/main.py`: `GET /api/metrics` → `text/plain; version=0.0.4`. **Gate it:** require `Authorization: Bearer ${METRICS_TOKEN}` when `METRICS_TOKEN` is set; if unset, bind to loopback/return 404 to non-local — never an open public endpoint. Excluded from the FTS/asset/probe classifiers and from its own metrics (no self-counting feedback).
- [ ] `backend/config.py`: `METRICS_TOKEN` (default empty → endpoint closed to the public).
- [ ] Tests: counters increment across a couple of requests; histogram buckets populate; `/api/metrics` without the token → 404/401 per policy; with the token → 200 and valid exposition format; `/api/metrics` itself is not counted.

### Task O3: Post-deploy prod smoke

We have an e2e harness; use a slice of it as a **deploy gate against the live site**, so a bad deploy is caught immediately, not by a user.

**Files:** `.github/workflows/ci-cd.yml` (designated wave is W4 for CI — schedule O3's edit into the W4 qa-crew ownership of the workflow, or run O3 in W2 under backend-obs if it only edits the `deploy` job's tail; **decide and record in W0 to keep one CI writer per wave**), `scripts/smoke-prod.sh` (new), `e2e/specs/smoke.spec.ts` (reuse; add a `@smoke` tag/grep).

- [ ] `scripts/smoke-prod.sh`: runs the `@smoke`-tagged Playwright specs against `https://discammer.com` (every top-level page 200, `/api/health` reports the just-deployed `GIT_SHA`, zero console errors, hydrated island count > 0). Read-only; no writes; no analyzer/URL input (privacy).
- [ ] CI: after the `deploy` job succeeds, a `smoke-prod` step runs `smoke-prod.sh`; failure marks the deploy run failed and surfaces traces (it does **not** auto-rollback — `deploy.sh` already has the in-box `:prev` rollback probe; this is the external confirmation + alert).
- [ ] Verify locally by pointing the script at the running compose (`BASE_URL` override) so the script itself is exercised without touching prod.

---

## Section F — New features (PRODUCT.md "install the pause")

### Task F1: Per-guide knowledge check

Each scam guide ends with a short, interactive check — recall beats re-reading, and it lands the lesson at the exact moment of attention. Client-side scored; results fold into the existing v4 **dossier** (`progress.ts`), so a learner's guide-checks ride along with their course progress in the same export/import. No accounts, no backend writes.

**Files:** `backend/templates/guide.html` (island mount), `frontend/src/components/KnowledgeCheck.tsx` (new), `frontend/src/data/quizzes.ts` (new), `frontend/src/utils/progress.ts`, locales (`client.quiz.*` authored RU/EN, one set per guide), vitest.

- [ ] `quizzes.ts`: typed pack keyed by guide slug — each guide gets 3–5 single-best-answer questions written **from the guide's content** (PRODUCT.md voice: concrete scenario → "what's the tell?"; no trick questions, no scolding on a wrong answer — explain the tell instead). Reuse the seeded guide slugs so every guide maps.
- [ ] `KnowledgeCheck.tsx`: mounts at the bottom of `guide.html`; reuses the established Exam/Quiz island patterns (`useId` radio groups, reduced-motion safe, `aria-live` for the per-question result, keyboard-navigable). On completion, records `{slug, score, bestOf}` into the dossier via a new `recordGuideCheck()` in `progress.ts` (best-of merge, same shape discipline as exams). Shows the tell for any missed question with a link back to the relevant guide section.
- [ ] `progress.ts`: extend the versioned dossier with `guideChecks` (bump to `v:2` with a forward-compatible importer — `v:1` dossiers import cleanly, missing `guideChecks` treated as empty); `exportProgress`/`importProgress` round-trip and best-of-merge the new field. **Don't break the v4 importer** — add, don't replace.
- [ ] `guide.html`: add the `data-component="KnowledgeCheck"` mount with the slug in `data-props` (`tojson | forceescape` — it's an attribute). Heading follows the arrows rule. Noscript fallback: a static "check yourself" list (useful without JS).
- [ ] Vitest: a fixture quiz scores correctly; best-of survives a worse retake; a `v:1` dossier imports without the new field; `recordGuideCheck` merges by slug. Verify: RU/EN screenshots of a guide page show the check; missed-answer links resolve to seeded slugs.

### Task F2: Link / URL inspector (`/{lang}/inspect`)

The analyzer's flagship sibling, focused on the single most common scam vector — the dodgy link. Paste a URL, get the analyst read on **why** it's suspicious, with the tells named and linked to the phishing guide. Same privacy contract as the message analyzer: **the URL never leaves the browser** (all heuristics run client-side; say so).

**Files:** `backend/templates/inspect.html` (new), `backend/routers/pages.py` (route), `backend/main.py` (route registration — designated writer is the W3 feature crew), `frontend/src/components/LinkInspector.tsx` (new), `frontend/src/data/url_heuristics.ts` (new), locales (`client.inspect.*` + authored page copy), vitest.

- [ ] `url_heuristics.ts`: pure `inspect(url)` returning typed findings. Coverage (deepens what `redflags.ts` only touched): punycode / `xn--`, mixed-script / Latin-Cyrillic homograph lookalikes (`раypal`-style), IP-literal host, userinfo `@`-trick (`bank.com@evil.ru`), excessive sub-domains / deceptive sub-domain (`paypal.com.secure-login.ru`), suspicious TLD set, raw URL shorteners, non-HTTPS, port oddities, lookalike of a known brand (small curated list), overlong/obfuscated path. Each finding `{id, severity 1–3, explainKey, guideSlug?}`. Robust URL parsing (handle missing scheme, trailing junk) without throwing.
- [ ] `LinkInspector.tsx`: labeled input → explicit INSPECT button (no on-input churn) → `aria-live` results: severity-weighted meter (reuse the ScamTypesGrid meter + its localized aria-label rule), each finding explained plainly and (where relevant) linking to `/{lang}/guide/phishing`. "Stays in your browser" + "heuristic, not a verdict" lines. Reduced-motion safe.
- [ ] `inspect.html`: SSR explainer with one concrete worked example per language (authority by specificity — e.g. dissect a homograph URL); noscript fallback = a static "how to read a link" checklist.
- [ ] `pages.py` + `main.py`: register `/{lang}/inspect` exactly like `/check` (same lang-prefix handling; not asset/probe-classified). Leave the axe-list `WIRE(v5)` from A2 satisfied by adding `/inspect` to the e2e a11y spec here.
- [ ] Vitest: punycode/homograph/`@`-trick/IP-host/deceptive-subdomain fixtures each fire the expected finding id; a clean `https://discammer.com` fires none; a scheme-less input parses; nothing throws on garbage. Verify: RU/EN screenshots; finding links resolve.

### Task F3: Shareable verdict card on the analyzer

A light viral/teaching loop on the existing analyzer: after a check, the user can generate a **shareable card** — "DiScammer · 4 red flags found" with the flag *categories* and the brand mark — to send to whoever forwarded them the message. **The message text never appears on the card** (Hard rule 12); only counts, severity, and categories. Builds on the F2-analyzer surface and the OG-card aesthetic (but rendered client-side to a canvas, downloadable).

**Files:** `frontend/src/components/VerdictCard.tsx` (new), `frontend/src/components/MessageAnalyzer.tsx` (add the affordance), locales (`client.analyzer.card.*`), vitest.

- [ ] `VerdictCard.tsx`: given the analyzer's **result object only** (count, max severity, fired flag categories — never the input text), render a branded card to an off-screen `<canvas>` at a share-friendly size, on the briefing-room palette (reuse the A2 tokens — no neon), and offer a PNG download (`discammer-check-YYYYMMDD.png`) + Web Share API where available (graceful fallback to download). No network calls.
- [ ] `MessageAnalyzer.tsx`: after results render, show a `[SHARE_CARD]` affordance that mounts `VerdictCard` with the result object. The analyzer's existing privacy/heuristic copy stays; add a one-liner that the card contains no message text.
- [ ] Vitest: the card-data builder, given a result, **never** includes any substring of the original message (assert with a fixture whose message contains a distinctive token that must be absent from card data); category mapping is correct; the zero-flags state renders a calm "no obvious flags — still trust your gut" card (not a false all-clear).
- [ ] Verify: RU/EN screenshots of the analyzer with a generated card; download produces a valid PNG.

### Task I1: Integration pass (orchestrator only)

- [ ] Navigation: add **INSPECT** (`/{lang}/inspect`) alongside the v4 CHECK + SEARCH per the DESIGN.md `nav-link` spec; extend the `aria-current` startswith map. Re-check the 768–900px header crowding the v4 plan flagged with 5 items — with a 6th, decide against DESIGN.md whether INSPECT lives in the top nav or collapses into MobileMenu (and is surfaced from `/check` + the phishing guide); **record the call here**.
- [ ] `MobileMenu.tsx` links array + `nav.inspect` locale keys (both langs).
- [ ] Confirm A2's axe spec now includes `/inspect`. Rebuild, commit, screenshot sweep.

---

## Section Q — QA: automate the manual rituals

### Task Q1: Visual regression in CI

Every gate since v3 has done a **manual** RU/EN × desktop/mobile screenshot sweep. Automate it so an unintended visual diff fails CI instead of relying on a human eye.

**Files:** `e2e/specs/visual.spec.ts` (new), `e2e/visual.config.ts` + committed baselines `e2e/**/*-snapshots/**` (new), `.github/workflows/ci-cd.yml` (designated this wave), `scripts/lhci.sh` (shared infra with Q2).

- [ ] `visual.spec.ts`: `toHaveScreenshot` full-page captures for the key pages (`/`, `/journal`, a post, a guide, `/course`, `/game`, `/about`, `/search`, `/check`, `/inspect`, 404) × RU/EN × desktop/mobile. Mask known-dynamic regions (the typewriter line, any timestamp) so the typewriter animation-phase diff that's plagued every manual sweep doesn't cause flakes. Pin viewport + deviceScaleFactor; chromium-only to match the e2e job.
- [ ] Generate baselines **once** against the post-A2 tree (so the new AA tokens are the baseline, not the old failing greys) and commit them. CI runs in the existing dockerized environment for font/render determinism; document the exact update command (`--update-snapshots`) for intentional UI changes.
- [ ] CI: fold a `visual` project/step into the `e2e` job (same browser image); upload diff artifacts on failure. Verify: green on the current tree; an intentional pixel change fails until baselines are refreshed.

### Task Q2: Lighthouse CI budgets

**Files:** `lighthouserc.json` (new), `.github/workflows/ci-cd.yml` (designated this wave), `scripts/lhci.sh` (new).

- [ ] `lighthouserc.json`: run `@lhci/cli` against `/`, `/check`, `/inspect`, a guide (served from the compose stack), with **budgets** as assertions — performance, accessibility, best-practices, SEO floors, plus key metric ceilings (TBT, CLS). Set floors at the current measured scores so the gate ratchets and can only improve (record W0 numbers).
- [ ] `scripts/lhci.sh` for local runs against compose; CI `lighthouse` step (needs the built image) uploads the report. Verify: budgets pass on the current tree; lowering a floor below current still passes, raising it above current fails (sanity).

---

## Section R — Review round & ship

- [ ] **R1:** four read-only reviewers over `8145095..HEAD` (backend / frontend / templates-i18n-a11y / infra). Verified findings only, prioritized security > correctness > a11y > performance > hygiene. Special attention: the privacy invariants (Hard rules 12–13) on F2/F3/O1; the non-root entrypoint's privilege-drop (A1); the token-contrast math (A2).
- [ ] **R2:** fix agents grouped by file ownership; gates re-run.
- [ ] Update `HANDOFF.md` → v5 state: what shipped, **new gotchas** (entrypoint drops privileges so the *image* runs as root by design; metrics endpoint is token-gated/closed-by-default; beacon is sampled+capped and stores nothing; dossier is now `v:2` with a back-compat importer; visual baselines must be refreshed via `--update-snapshots` on intentional UI changes; Lighthouse floors ratchet), and the still-open owner actions (git-lfs migrate, nginx reconcile).

## Final verification (G4)

- [ ] `pytest -q` all green; count recorded below.
- [ ] `npm test` (vitest) green; `npx tsc --noEmit` + `npm run build` clean; rebuilt static committed; no `WIRE(v5)` markers left.
- [ ] Full e2e suite green locally against compose, **including** the A1 non-root assertion and the A2 contrast-enforced axe run.
- [ ] Visual-regression baselines committed and green; Lighthouse budgets green.
- [ ] Screenshot sweep (RU/EN × desktop/mobile × all pages incl. `/inspect`) vs `/tmp/dcm-v5-before/` — only the intended A2 muted-text colour shift + the new pages/nav differ.
- [ ] `git log` reviewed: one commit per wave + R2; **nothing pushed**.

## Metrics (fill W0 → G4)

| Metric | Before (W0) | After (G4) | Target |
|---|---|---|---|
| pytest count | 69 | — | ≥ 85 |
| vitest tests | 36 | — | ≥ 50 |
| e2e tests (chromium) | 44 | — | ≥ 60 |
| Container process user | **root** (uid 0) | — | **non-root (uid 10001), CI-proven** |
| axe serious/critical incl. `color-contrast` | n/a (contrast **excluded**) | — | **0, contrast enforced** |
| `--ink-muted` contrast vs canvas | muted body uses `#6b7588` ≈ **4.12:1** (placeholders `#475064` ≈ **2.37:1**) — **fails AA** on canvas `#0b0f1a` | — | **≥ 4.5:1** |
| `--ink-dim` (large/non-text) contrast | `#6b7588` ≈ **4.12:1** (canvas) / **3.81** soft / **3.41** raised / **3.19** input; `#475064` ≈ **2.37:1** (fails 3:1) | — | **≥ 3:1** |
| Markdown render | sync, on event loop | — | off-loop (threadpool or seed-prerender) |
| Supply-chain audit in CI | none | — | `pip-audit` + `npm audit`, high/critical = fail |
| Client error visibility | none (guess from logs) | — | sampled beacon + scrubbed structured logs |
| `/api/metrics` (RED) | none | — | gated exposition endpoint, tested |
| Visual regression | manual sweep | — | automated baselines, CI-gated |
| Lighthouse budgets | unmeasured | — | floors ratcheted from W0, CI-gated |
| Post-deploy prod smoke | none | — | `@smoke` slice vs discammer.com after deploy |

**W0 baseline (recorded 2026-06-19):** `pytest` **69** · `vitest` **36** · `e2e` **44** (per v4 G4; not re-run locally — needs compose) · `tsc`+`build` clean, no `backend/static` drift · i18n-audit clean (250 client.* keys, 0 dead / 0 missing, en==ru) · v5 base SHA **`8145095`** · branch **`v5-features`** · baseline full-page screenshots in `/tmp/dcm-v5-before/`.

**Real canvas tokens (DESIGN.md, authoritative — CLAUDE.md's `#0B0E17` is stale):** canvas `#0b0f1a`, canvas-soft `#121828`, canvas-raised `#1a2236`, canvas-input `#1e2740`. Muted tokens at base: `--color-ink-mute #6b7588`, `--color-ink-faint #475064`, `--color-text-muted #6b7588`.

**Measured contrast (A2 "before"):** `#6b7588` → 4.12 / 3.81 / 3.41 / 3.19 (canvas/soft/raised/input); `#475064` → 2.37 / 2.19 / 1.96 / 1.83. **A2 targets validated by measurement:** `--ink-muted #8b94a8` → 6.29 / 5.81 / 5.20 / 4.86 (all ≥4.5 ✓); `--ink-dim #6b7588` → all ≥3:1 ✓ (keep as the non-text/large token); **retire `#475064`** for text/meaningful glyphs (fails 3:1 everywhere).

**W0 decisions (recorded):**
1. **Path reconciliation** — e2e specs live in `e2e/` (NOT `e2e/specs/`). So A2 edits `e2e/a11y.spec.ts`; Q1 creates `e2e/visual.spec.ts`; O3 reuses `e2e/smoke.spec.ts`. The axe spec's `A11Y_PAGES = ['/en/', '/en/course', '/en/check', '/en/search']`, `EXCLUDED_RULES = ['color-contrast']` — A2 removes the exclusion; G3 adds `/en/inspect`.
2. **O3 CI-writer wave → W4** (qa-crew owns `ci-cd.yml` in W4; the post-deploy `@smoke` step is adjacent to deploy gating). Keeps one CI writer per wave: W1 infra-runtime, W2 infra-ci, W4 qa-crew.
3. **A1 entrypoint → `scripts/docker-entrypoint.sh`** per plan spec (the already-deployed prod `main` used root `docker-entrypoint.sh` + a static `app` user; v5 re-does it to spec with `APP_UID=10001` ARG + CI non-root proof per Hard rule 14).
4. **Owner action (merge-time)** — `v5-features` is cut from `8145095` per owner decision and re-implements A1/A2 from scratch; prod `main` already ships ad-hoc A1/A2 (`e97cf6d`, `062d2a1`). The owner must reconcile this divergence when landing v5 (likely: land v5-features as the canonical A1/A2, superseding the ad-hoc commits).

## Deferred to v6 (decided, with reasons)

- **Accounts / server-side progress sync** — the v4 dossier (now extended in F1) covers backup/restore without an auth surface; revisit only if cross-device sync becomes a real ask.
- **`git lfs migrate` of the Unity binaries + git-lfs on prod** — still an **owner action** (carried from v4); config is ready, deploy is safe either way, so it doesn't block code work. Do it before more `.br` versions accumulate.
- **Privacy-first analytics dashboard** — `/api/metrics` (O2) now gives RED on the box, and nginx logs + GoAccess still cover traffic; a hosted privacy analytics decision waits until there's a concrete question the metrics can't answer.
- **Real backend persistence of quiz/check scores** — stays client-side in the dossier (privacy, no auth); promote only alongside accounts.
- **Comments / community submissions / CMS, framework or styling migrations, new content** — out of scope, unchanged from v3/v4. The analyzer's red-flag pack and the URL heuristics are curated in-repo, not user-submitted.
- **PWA / offline** — considered; the site is a reference people return to, so installability has merit, but it's a self-contained feature that doesn't depend on anything in v5 — slot it into v6 if the reference-tool framing proves out.
