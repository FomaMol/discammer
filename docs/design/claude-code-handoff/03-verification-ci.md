# 03 · Verification & CI gate

Nothing is "done" until this passes. A6 owns it; the lead refuses to merge a red gate.
Run the full sequence after **every** task merge — not just at the end.

## The gate (from `deslop-handoff.md`)

```bash
# 1 · type-check + build + unit, then COMMIT the rebuilt backend/static
cd frontend && npx tsc --noEmit && npm run build && npm test

# 2 · backend green
cd .. && backend/.venv/bin/python -m pytest -q

# 3 · i18n: 0 dead / 0 missing / en == ru
backend/.venv/bin/python scripts/i18n_audit.py

# 4 · accessibility: axe on 7 pages incl. /inspect, color-contrast ENFORCED
cd e2e && npx playwright test a11y.spec.ts

# 5 · visual regression — refresh baselines ONLY for intended UI change
cd e2e && npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots
```

Then screenshot every changed page **RU/EN × desktop/mobile** and confirm the only diffs are
the intended ones.

## Hard constraints (do NOT break — these are load-bearing)

Copy the relevant ones into each dispatch. Full text in `deslop-handoff.md`.

1. **Islands architecture.** New widget = `.tsx` + `main.tsx` registry + `data-component` mount + rebuild.
2. **`backend/static/` is a committed Vite artifact.** Rebuild + commit after any `frontend/src` or
   Tailwind-class-in-template change. **CI fails on drift.**
3. **WCAG AA enforced** (axe, 7 pages incl. `/inspect`). Body ≥ 4.5:1, large/non-text ≥ 3:1. Use tokens
   `--color-ink-mute #8b94a8`, `--color-ink-dim #6b7588` (non-text only). Never `#475064` for text;
   no `text-[#…]` literals dodging tokens.
4. **RU/EN parity.** Every string in `client.*` in **both** locales, **authored** RU (not translated),
   `PRODUCT.md` voice, forbidden-words list applies. Dynamic keys are invisible to the scanner — use
   `tr('literal')` per branch or add to `scripts/i18n_allowlist.txt`; never `tr(cond?'a':'b')`.
5. **Arrows rule.** Heading locale strings are plain text; the single styled aria-hidden `>` is rendered
   by the consumer. Never both.
6. **Palette lock.** No neon `#00F0FF`. Cyan = `#65def0`. OKLCH chroma ≤ 0.16. One chromatic accent
   (cyan voice + amber/green/red semantic). No purple, no chromatic gradients, no second accent.
7. **Tailwind v4 via `@theme`** in `globals.css` — there is **no** `tailwind.config.ts`. New utility
   classes need a rebuild (`@source` scans templates).
8. **Motion.** `prefers-reduced-motion` kills scanlines/glitch/typewriter — extend to ALL new motion.
   GPU-only (`transform`/`opacity`). Don't out-game the game.
9. **Plyr is never unmounted** after init (removeChild crash) — only hidden.
10. **Mobile-first reading.** Body 16–17px, measure < 65ch on phones, no horizontal scroll outside
    intentional carousels. Layout breathes ~10–15% wider for Cyrillic.
11. **Visual-regression baselines** (CI-seeded on Linux) fail until refreshed via `--update-snapshots`
    for intended change. See `docs/deploy/visual-regression.md`.

## Slop checklist (impeccable + DESIGN.md bans) — A1/A6 sign-off

- [ ] No pixel-arcade font; wordmark is JetBrains Mono 800 uppercase.
- [ ] No Inter anywhere (body or display) — Geist instead.
- [ ] No pure `#000` / `#fff` — tinted canvas/ink tokens only.
- [ ] No cyan with chroma > 0.10; `#65def0` only.
- [ ] No purple/blue or any chromatic gradient — solid fills only.
- [ ] No scanline overlay on every section (reserved: game launcher, system-event modal).
- [ ] No three-equal-card feature row — bento / list / zigzag.
- [ ] No hero-metric template ("10,000+ users protected!") — real numbers or cut.
- [ ] No modals for nav / language / quiz — inline progressive disclosure.
- [ ] No side-stripe colored borders > 1px (the one prose `h2` left-border is the only exception).
- [ ] No em dashes in body copy; no AI words (delve/seamless/elevate/unleash/next-gen/"in the world of").
- [ ] Icons are Phosphor (not Lucide/Feather), consistent stroke weight.
- [ ] No lorem/filler, no round numbers, no "John Doe".
- [ ] Glow only on `:focus-visible`, active threat ≥ 4, or featured-card hover — never on every accent.

## Per-page screenshot matrix (A6, before/after)

| Page | EN desktop | EN mobile | RU desktop | RU mobile |
|---|---|---|---|---|
| `/` (home) | ☐ | ☐ | ☐ | ☐ |
| `/journal` | ☐ | ☐ | ☐ | ☐ |
| `/journal/{slug}` | ☐ | ☐ | ☐ | ☐ |
| `/guide/{slug}` | ☐ | ☐ | ☐ | ☐ |
| `/course` | ☐ | ☐ | ☐ | ☐ |
| `/inspect` | ☐ | ☐ | ☐ | ☐ |
| `/check` | ☐ | ☐ | ☐ | ☐ |
| `/game` | ☐ | ☐ | ☐ | ☐ |
| 404 | ☐ | ☐ | ☐ | ☐ |

The only acceptable diffs are the ones named in the task. Anything else is a regression.
