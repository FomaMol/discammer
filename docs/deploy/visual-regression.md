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

Because the linux baselines are missing, the CI visual step is **non-blocking**
(`continue-on-error: true` in `.github/workflows/ci-cd.yml`, in the `e2e` job).
It uploads diffs as the `visual-regression-results` artifact but CANNOT turn the
e2e gate red. **CI is NOT proving visual parity yet** — it only proves the spec
executes.

### One-time linux baseline seeding (owner/CI action)

This needs a push the repo owner controls (same pattern as the A1 CI-only
proof). Steps:

1. In `.github/workflows/ci-cd.yml`, temporarily append `--update-snapshots` to
   the **"Visual regression (Q1, …)"** step's run line:
   ```yaml
   run: npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots
   ```
2. Push to a branch / main. The job generates `*-linux.png` baselines under
   `e2e/visual.spec.ts-snapshots/`. Commit them back (download the artifact, or
   add a commit step) so they live in the repo alongside the darwin set.
3. Revert the `--update-snapshots` flag, and flip `continue-on-error: true` →
   `false` on that step to make the visual gate **blocking**.

After step 3, a real visual regression on CI fails the e2e job.

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
