# 03 — Verification & CI gates (owned by A6, enforced on every PR)

No task is "done" until it passes this suite on the integration branch. A6 runs it with
**playwright-cli**; red bounces back to the owning agent with the failing artifact attached.

## The gate (must all be green to merge)

```bash
# 1. Type + build + unit  (A3 commits the rebuilt backend/static)
cd frontend && npx tsc --noEmit && npm run build && npm test

# 2. Backend
cd .. && backend/.venv/bin/python -m pytest -q

# 3. i18n parity  (0 dead / 0 missing / en == ru keys; authored, not translated)
backend/.venv/bin/python scripts/i18n_audit.py

# 4. Accessibility  (axe, color-contrast ENFORCED, 7 pages incl. /inspect + home checker)
cd e2e && npx playwright test a11y.spec.ts

# 5. Visual regression  (refresh baselines ONLY for intended v2 diffs)
cd e2e && npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots
```

## v2-specific acceptance tests (new, A6 authors them)

| Test | Asserts |
|---|---|
| `checker.spec.ts` | Paste a known scam string → result shows ≥1 tell + LVL pill; `aria-live` region updates; keyboard-only path paste→result→guide works; **Network tab shows zero requests** (privacy). |
| `inspector.spec.ts` | Lookalike domain flagged HIGH; raw-IP + `@` flagged; clean URL → softened "not the same as safe" copy; link is never navigated. |
| `meter-grayscale.spec.ts` | Screenshot threat meters with `filter:grayscale(1)`; OCR/text assert the WORD + number are present (color-independent meaning). |
| `three-ways.spec.ts` | Three links present, ≥44px hit area, visible focus, reachable by Tab in order. |
| `focus-skiplink.spec.ts` | First Tab focuses skip link; every interactive element shows the 2px cyan ring. |
| `no-ab-switcher.spec.ts` | Grep prod templates for the rhythm A/B control → must be absent. |
| `reduced-motion.spec.ts` | With `prefers-reduced-motion`, canvas is static, reveals snap, no infinite animation runs. |
| `i18n-parity.spec.ts` | Every new v2 string key exists and differs sensibly between en.json and ru.json (not identical = translated heuristic). |
| `cyrillic-layout.spec.ts` | RU renders without overflow/clipping at 360px and 1280px; measure < 65ch. |
| `perf.spec.ts` | Home LCP within budget; fonts non-blocking; no CLS from font swap. |

## Brand-lock static checks (cheap, run in CI pre-test)
- No `#00F0FF`, no purple/violet hex, no second accent, no gradient-text, no pixel font, no Inter.
- No `text-[#…]` literals dodging tokens; muted text uses `--color-ink-mute`, never retired `#475064`.
- Exactly one chromatic accent system (cyan + semantic amber/green/red).

## Convergence checklist (A0 signs off)
- [ ] P0 tokens + fonts merged first
- [ ] 3 senior-review blockers cleared
- [ ] detection→learning loop wired
- [ ] all gates green; baselines reflect only intended diffs
- [ ] RU/EN authored parity on every new string
- [ ] reduced-motion + AA + keyboard verified on home, inspect, guide, course, search
- [ ] `DESIGN.md` ↔ `globals.css` in sync; v2 system documented

## Rollback posture
v1 is on prod. Ship v2 behind the normal deploy flow; if any gate regresses post-merge, revert the
single task PR (tasks are independently revertible by design).
