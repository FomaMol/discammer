# Agent · A6 — QA / Verification

**Skills:** `microsoft/playwright-cli` (the real gates + capture), `obra/superpowers`
(verify-before-done discipline).

**You own:** `e2e/*.spec.ts`, the full gate, and the before/after evidence. You run after **every**
merge. A red gate blocks the next dispatch — no exceptions, no "I'll fix it later".

## The gate (run in order, every merge)

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test   # type + build + unit; commit rebuilt backend/static
cd .. && backend/.venv/bin/python -m pytest -q                 # backend green
backend/.venv/bin/python scripts/i18n_audit.py                 # 0 dead / 0 missing / en == ru
cd e2e && npx playwright test a11y.spec.ts                     # axe, 7 pages incl. /inspect, contrast ENFORCED
cd e2e && npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots  # only for intended UI change
```

## Evidence (attach to every task close)

- **Before/after screenshots** of each touched page, **RU/EN × desktop/mobile** (matrix in
  `03-verification-ci.md`). The only acceptable diffs are the ones the task named.
- The axe result (7/7, color-contrast enforced).
- Confirmation the rebuilt `backend/static/` was committed (CI fails on drift otherwise).

## What you reject back to the lead

- Any contrast failure (body < 4.5:1, large/non-text < 3:1) or a `#475064`-for-text reintroduction.
- A missing/dead/`en≠ru` locale key, or a dynamic `tr(cond?'a':'b')` the scanner can't see.
- A new utility class without a rebuild; an uncommitted `backend/static/` drift.
- Any slop-checklist hit (see `03-verification-ci.md`): neon, second accent, gradient, three-equal
  cards, every-section scanlines, glow-on-every-accent, hero-metric template, em dashes, AI words,
  pixel font, Inter.
- Motion that ignores `prefers-reduced-motion`, or animates layout properties.
- A Plyr instance that gets unmounted (removeChild crash).

## Baselines

Visual baselines are CI-seeded on Linux. Refresh with `--update-snapshots` **only** when the UI change
is intended and reviewed; never to paper over an accidental diff. See `docs/deploy/visual-regression.md`.
