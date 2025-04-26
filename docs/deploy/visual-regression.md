# QA infra: visual regression (Q1) + Lighthouse budgets (Q2)

This doc covers two CI gates added to the `e2e` job, plus the post-deploy
production smoke (O3). All three are pure QA infra — no app source changed.

---

## Q1 — Visual regression

Automates the manual RU/EN × desktop/mobile screenshot sweep so an unintended
visual diff fails CI.

### What it captures

`e2e/visual.spec.ts` takes full-page `toHaveScreenshot` snapshots of the key
surfaces, each in **en + ru**, each under two **projects** (desktop + mobile):

| surface | path (en) | real slug |
|---------|-----------|-----------|
| home    | `/en/` | — |
| journal | `/en/journal` | — |
| post    | `/en/journal/the-story-of-alex-chen` | `the-story-of-alex-chen` |
| guide   | `/en/guide/phishing` | `phishing` |
| course  | `/en/course` | — |
| game    | `/en/game` | — |
| about   | `/en/about` | — |
| search  | `/en/search` | — |
| check   | `/en/check` | — |
| inspect | `/en/inspect` | — |
| 404     | `/en/__visual_regression_missing__` (asserts 404) | — |

11 surfaces × 2 langs × 2 projects = **44 snapshots**.

### Geometry + determinism

`e2e/visual.config.ts` is a **dedicated** Playwright config (separate from
`playwright.config.ts`) that pins:

- **desktop** project: viewport `1280×800`, `deviceScaleFactor: 1`
- **mobile** project: viewport `390×844`, `deviceScaleFactor: 2` (Pixel 5 UA,
  but our own pinned geometry so a Playwright device-table bump can't move it)
- chromium-only (matches the e2e job)
- `animations: 'disabled'`, `caret: 'hide'`, `maxDiffPixelRatio: 0.01`

**Masked dynamic regions** (so animation phase / clock never flake the diff):

- `[data-component="HeroTypewriter"]` — text mutates every 40–80ms
- `[data-component="HeroTerminal"]` — text mutates every 180ms
- `[data-component="HeroShader"]` — a `requestAnimationFrame` canvas (CSS
  `animations: disabled` does NOT freeze rAF)
- `[data-component="WordmarkReveal"]` — one-shot reveal animation
- `[data-component="SimulateTerminal"]` — timer-driven console
- any `<span>` whose text matches `\d{2}:\d{2} UTC` — the server-rendered
  wall-clock stamp in the HUD strip + situation-report header on `/`

### Running it locally (darwin)

```bash
cd e2e
# verify against the committed baselines (boots uvicorn itself, or set E2E_BASE_URL)
npx playwright test visual.spec.ts -c visual.config.ts

# regenerate baselines after an intended visual change:
npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots
```

The default `npx playwright test` (the 11 functional specs) does **not** run the
visual spec: `visual.spec.ts` self-skips unless `PW_VISUAL` is set, and only
`visual.config.ts` sets it. So the existing e2e gate is unaffected.

### Platform / baseline constraint (IMPORTANT — read before trusting CI green)

Playwright suffixes snapshots **per-OS**: `*-darwin.png` (macOS dev) vs
`*-linux.png` (CI / docker). Baselines from one OS DO NOT satisfy the other —
fonts and sub-pixel rasterization differ.

- The committed baselines are **darwin** (`e2e/visual.spec.ts-snapshots/*-darwin.png`,
  44 files). They prove the spec runs and are useful for local dev.
- The authoritative **linux** baselines do NOT exist yet. They must be seeded by
  a one-time CI run (Docker isn't available on the dev box, so they can't be
  generated locally).

### Current status (be precise about this)

| thing | state |
|-------|-------|
| the 44-snapshot spec + pinned geometry | written, passes locally on darwin |
| the CI wiring (self-arming gate + seeding path) | **configured** — present in `ci-cd.yml`, not yet exercised by a CI run |
| committed `*-linux.png` baselines | **none (0 of 44)** |
| the gate itself | **INERT** — it cannot fail today |

**CI is NOT proving visual parity.** It only proves the spec executes. A real
visual regression today uploads a `visual-regression-results` artifact and the
e2e job still goes green. Nothing here is production verified.

### How the gate arms itself

The step is no longer pinned `continue-on-error: true`. The `Decide
visual-regression mode (Q1)` step counts the committed `*-linux.png` baselines
and sets the gate accordingly:

| committed `*-linux.png` | `continue-on-error` | effect |
|---|---|---|
| **0** (today) | `true` | non-blocking; logs a `::warning::` that parity is unproven |
| **> 0** | `false` | **blocking** — a real visual regression fails the e2e job |

So the gate goes live **in the same commit that adds the baselines** — there is
no second workflow edit to remember, and no way to leave a `continue-on-error`
pin behind by accident. It also fails safe: if the decide step is skipped, the
gate stays non-blocking rather than turning CI red.

### The one remaining owner step: seed the linux baselines

Baselines are platform-specific and **cannot be generated on the macOS dev box**
(no Docker there, and darwin rasterization wouldn't match Linux anyway), so this
needs one CI run the owner triggers. No workflow edit is required.

1. **Actions → CI/CD → Run workflow**, set **`seed_visual_baselines` = `true`**.
   (This `workflow_dispatch` run cannot deploy: `deploy` is pinned to
   `github.event_name == 'push'` on `main`, and `smoke-prod` needs `deploy`.)
2. The `e2e` job runs the visual spec with `--update-snapshots` against the
   compose-served app and uploads the generated files as the
   **`visual-baselines-linux`** artifact. The seeding run is forced
   non-blocking — it *defines* the baseline, so it has nothing to compare to.
3. Download that artifact, unzip it into `e2e/visual.spec.ts-snapshots/`, and
   commit the 44 `*-linux.png` files alongside the darwin set.

On that commit the gate flips to **blocking** by itself, and from then on a real
visual regression fails the e2e job. Until step 3 lands, treat a green e2e as
saying nothing about visual parity.

> **Reviewing the seeded baselines:** they are the definition of "correct", so
> look at them before committing — `--update-snapshots` will happily bless a
> regression that is already on the branch.
>
> **Never regenerate the linux set on macOS.** `--update-snapshots` locally
> writes `*-darwin.png` only; it cannot refresh the linux baselines.

---

## Q2 — Lighthouse CI budgets

`lighthouserc.json` runs `@lhci/cli@0.15.1` against 4 surfaces with category
floors + metric ceilings as **assertions** (errors, not warnings):

| URL | audited |
|-----|---------|
| `/en/` | home |
| `/en/check` | message analyzer explainer |
| `/en/inspect` | URL inspector explainer |
| `/en/guide/phishing` | a guide |

### Assertions (the ratchet)

| assertion | threshold |
|-----------|-----------|
| `categories:performance` | minScore **0.70** |
| `categories:accessibility` | minScore **0.95** |
| `categories:best-practices` | minScore **0.95** |
| `categories:seo` | minScore **0.95** |
| `total-blocking-time` | maxNumericValue **300 ms** |
| `cumulative-layout-shift` | maxNumericValue **0.25** |

Aggregation is `median-run` over `numberOfRuns: 3`.

### Measured floors (how they were set)

Measured **2026-06** against the **uvicorn dev server** (median of 3 runs) with
the Playwright-managed Chrome, preset `desktop`. Floors are set **below** these
so the ratchet starts safe; the dockerized prod build (nginx gzip + caching,
baked static) scores **higher** than the dev server, so the floors are
conservative.

| URL | perf | a11y | best-practices | seo | TBT | CLS |
|-----|------|------|----------------|-----|-----|-----|
| `/en/`               | 80 | 100 | 100 | 100 | 0 ms | 0.153 |
| `/en/check`          | 81 | 100 | 100 | 100 | 0 ms | 0.170 |
| `/en/inspect`        | 84 | 100 | 100 | 100 | 0 ms | 0.125 |
| `/en/guide/phishing` | 88 |  96 | 100 | 100 | 0 ms | 0.000 |

(A cold first run of `/en/` once measured perf **69** / TBT **175 ms** before the
JIT/cache warmed — the perf floor 0.70 and TBT ceiling 300 ms absorb that
cold-start jitter so the gate doesn't flake.)

**Ratcheting:** when these numbers durably climb (especially against prod),
re-measure and RAISE the floors in `lighthouserc.json`.

### Running it locally

```bash
# against the local dev/stack (default BASE_URL=http://127.0.0.1:8000)
BASE_URL=http://127.0.0.1:8000 ./scripts/lhci.sh

# against any origin (read-only)
BASE_URL=https://discammer.com ./scripts/lhci.sh
```

`scripts/lhci.sh` resolves a Chrome binary (CHROME_PATH → Playwright's "Google
Chrome for Testing" → system Chrome), rebuilds the 4 URLs from `BASE_URL`, and
runs `lhci autorun` with `lighthouserc.json`. Reports land in `.lighthouseci/`
(not committed — see note below).

### CI

A **blocking** `Lighthouse CI budgets (Q2)` step lives in the `e2e` job, after
the Playwright run (the app is already served by docker compose there). The
report is uploaded as the `lighthouse-report` artifact.

> **Housekeeping:** `scripts/lhci.sh` writes a `.lighthouseci/` dir at the repo
> root. It is regenerated each run and should not be committed — add
> `.lighthouseci/` to `.gitignore` (outside this change's ownership).

---

## O3 — Post-deploy production smoke

`scripts/smoke-prod.sh` runs the `@smoke`-tagged Playwright specs against
`$BASE_URL` (default `https://discammer.com`). **Read-only**: the tagged tests
are plain GETs + passive assertions — no writes, no analyzer/URL input
(privacy). Tagged coverage:

- every top-level page (en + ru) returns 200, zero console errors, ≥1 island
  hydrates (`@smoke <label> <path>` — the existing per-page sweep)
- `@smoke /api/health reports a build version …` — `/api/health` is 200,
  `db:ok`, version non-empty; when `SMOKE_EXPECT_SHA` is set it must match the
  deployed SHA (short-prefix match), proving the box swapped images
- `@smoke home hydrates at least one island` — asserts hydrated island count > 0

### Running it locally

```bash
# exercise the script against the dev server (GIT_SHA defaults to "dev")
BASE_URL=http://127.0.0.1:8000 ./scripts/smoke-prod.sh

# pin to an expected SHA
SMOKE_EXPECT_SHA=abc1234 BASE_URL=https://discammer.com ./scripts/smoke-prod.sh
```

### CI

A `smoke-prod` job runs **after** the `deploy` job succeeds (push to main only),
targeting `https://discammer.com` with `SMOKE_EXPECT_SHA` set to the short form
of `github.sha`. A failure marks the run failed — it does **not** auto-rollback;
`deploy.sh` already restores the `:prev` image in-box on a failed health probe.
On failure the Playwright results upload as `smoke-prod-results`.
