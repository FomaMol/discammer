# Design handoff — de-slop pass for DiScammer

> **For a Claude design session.** This is a brief for making DiScammer feel **less AI-generated and more crafted**, without throwing away what already works or breaking the build. Read this, then `DESIGN.md` (the design system spec) and `PRODUCT.md` (brand voice + anti-references) — both are authoritative. Use the design skills `impeccable` / `taste` / `soft` for premium craft and `redesign` for the generic-AI-pattern checklist.
>
> Ground every change in the live site, not memory: boot it (`backend/.venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000`) and screenshot the page you're touching before and after.

## The verdict (read first)

DiScammer **already has a real concept** — the briefing room of an anti-fraud analyst's workstation: case-file strips, terminal blocks, threat-level meters, IP-style metadata, JetBrains-Mono "voice." That concept is rare and good. **Do not redesign it. Do not introduce a new aesthetic, a second accent colour, or a Web3/AI-gradient look.** The cyberpunk palette is deliberately desaturated (OKLCH chroma ≤ 0.16, single cyan `#65def0`, no neon) — that restraint is the brand.

The "AI slopeness" lives in **execution**, and it's almost entirely one disease: **templated uniformity.** The system is applied so evenly that the page reads as a stack of near-identical modules. AI design tells aren't in the skin here — they're in the *rhythm*. Fix the rhythm and the slop goes away.

## The honest audit (grounded in the current build)

Priorities: **P0** = strongest slop tell, biggest payoff. **P3** = polish.

### P0 — The home page is three identical 3-card rows in a row
`INTERVIEW_LOG`, `NEWSLETTER_FEED`, `ARTICLE_DATABASE` are each a row of **three equal cards** with the same eyebrow + same grid + same spacing. Three-equal-columns is *the* canonical generic-AI layout, and here it repeats three times consecutively. The cyberpunk skin doesn't hide the templated bones.
- **Fix:** give each journal stream a *different* shape. E.g. interviews = a featured lead item + smaller siblings (asymmetric / zig-zag); newsletters = a tight dated list (it's text, not thumbnails); articles = a 2-up with a larger hero card. Vary card heights with content instead of forcing equal heights. One of the three rows earning a distinct layout breaks the template feel instantly.
- Files: `backend/templates/home.html`, `frontend/src/components/ContentCarousel.tsx`, `JournalBroadsheet.tsx`.

### P0 — Section monotony: every section wears the same uniform
Every block on home opens with an identical `// SECTION_LABEL` mono-uppercase eyebrow and the same module width/spacing. There's no variation in cadence, scale, or alignment between sections, so the eye stops distinguishing them.
- **Fix:** vary the vertical rhythm and the section "temperature." Let one or two sections run full-bleed or asymmetric; let one breathe with much more whitespace; don't give *every* section the terminal-label treatment. The goal is an editorial cadence (loud → quiet → loud), not a checklist of equal modules.

### P1 — Chrome-on-everything (the costume creeps past the meaning)
`//`, `>`, `_`, ALL-CAPS mono labels, blinking cursors, and case-IDs appear on nearly every element. `PRODUCT.md` Design Principle #1 is explicit: *"Show the work, not the costume — cyberpunk surface elements appear only where they carry meaning. Decorative-only chrome gets cut."* Right now the terminal chrome is wallpaper, which is what makes it read as theme-template rather than tool.
- **Fix:** keep the terminal/case-file treatment where it *means* something — the analyzer, the threat-level meter, the guide case-file strip, the game launcher. Strip it from places where it's decoration (e.g. journal listings can be quieter editorial). Less chrome, more contrast where chrome remains.

### P1 — Typography is mono-for-everything, so hierarchy is muddy
The display headlines (hero, `/check`, section headers) are all JetBrains Mono. Mono *is* the brand voice (`DESIGN.md`), but using it for **every** headline flattens hierarchy and tips toward "hacker-theme template." The system already loads **Geist** for reading.
- **Fix:** let Geist carry editorial display in journal/articles/guides (real reading surfaces) and reserve **mono for genuine data/terminal/voice moments** (analyzer output, metadata, the hero wordmark, case files). Add weight hierarchy — the system mostly uses 400/700; introduce **500/600** for mid-tier emphasis. Tighten tracking on large display, cap measure at ~65ch, and add `text-wrap: balance` to headlines / `pretty` to body to kill orphans.

### P1 — Symmetry and flatness
Hero, `/check`, and the CTAs are centred and symmetric; cards sit flat side-by-side with uniform border + dark fill + identical radius and no layering.
- **Fix:** break symmetry deliberately (offset a header over centred content; let an element bleed off-grid). Introduce depth with negative-margin overlap (e.g. the case-file strip overlapping the title block). Differentiate cards by *role* (a featured guide vs a list row shouldn't look identical); vary radius (tighter inner, softer container); use **tinted** shadows (carry the canvas blue, never pure black).

### P2 — Stat HUD specificity
The home HUD shows big round-ish numbers and a `24/7`. Round/placeholder metrics and `24/7` are AI tells, and `PRODUCT.md` explicitly rejects the hero-metric template ("$50M+ saved from fraud!").
- **Fix:** every number must be **true and specific** (real guide count, real last-updated date/time, real module count) or it goes. Replace `24/7` with something concrete (e.g. a real "last threat logged: 3h ago" already used on guide pages). Authority by specificity (`PRODUCT.md` Principle #2).

### P2 — Flat sterile dark sections
Large flat `canvas`/`canvas-soft` fills with only text feel unfinished (a known slop tell).
- **Fix, tastefully:** add *subtle* texture — a fixed `pointer-events:none` grain overlay at very low opacity, or the existing 40px hairline grid extended to one or two more surfaces (DESIGN.md already defines it for the hero). Keep it quiet — this is a briefing room, not the game. Respect `prefers-reduced-motion` and don't add ambient motion to reading surfaces.

### P3 — Micro-craft
Optical alignment on icon+label pairs and the `>` arrow; consistent Phosphor stroke weight (DESIGN.md already chose Phosphor, not Lucide — good); hover/active/focus states audited for spring-ish easing (200–300ms, `transform`/`opacity` only); staggered scroll-entry instead of everything mounting at once (reduced-motion-safe).

### What's already good — keep it
Desaturated single-accent palette · Phosphor (not Lucide) icons · self-hosted Geist + JetBrains Mono (no Inter, no pixel font) · the case-file guide framing · the privacy-first analyzer/inspector · authored RU/EN copy in `PRODUCT.md` voice · custom 404 · keyboard/focus/reduced-motion already wired · **WCAG AA now enforced**. Don't regress any of these.

## Hard constraints — do NOT break these

These are load-bearing; violating them breaks CI or undoes the v5 hardening.

1. **Islands architecture.** Jinja SSR + React islands. A new interactive widget = 3 edits: the `.tsx` in `frontend/src/components/`, a registry entry in `frontend/src/main.tsx`, and a `<div data-component="…" data-props='…'>` in a template. Then rebuild.
2. **`backend/static/` is a committed Vite artifact.** After any `frontend/src` (or Tailwind-class-in-template) change: `cd frontend && npm run build` and commit the rebuilt static. **CI fails on drift.** Tailwind v4 scans templates via `@source`, so new utility classes need a rebuild.
3. **WCAG AA is enforced now (axe gate on 7 pages incl. `/inspect`).** Any colour/text must clear **4.5:1** (body) / **3:1** (large + non-text). Use the tokens: `--color-ink-mute #8b94a8` (muted text), `--color-ink-dim #6b7588` (non-text/decorative only). **Never reintroduce `#475064` for text** (retired; fails AA). Don't add `text-[#…]` literals that dodge the tokens.
4. **RU/EN parity.** Every new string lives in `client.*` in **both** `backend/locales/en.json` and `ru.json`, **authored** (RU is not a literal translation), `PRODUCT.md` voice, forbidden-words list applies (no *delve/seamless/elevate/unleash/next-gen/"in the world of"*). The `i18n_audit.py` CI gate enforces 0-dead / 0-missing / en==ru. **Dynamic keys are invisible to the scanner** — reference `tr('literal')` per branch or add to `scripts/i18n_allowlist.txt`; never `tr(cond?'a':'b')`.
5. **Arrows rule.** Section-heading locale strings are plain text; the single styled **aria-hidden `>`** is rendered by the consumer (template/component). Never both.
6. **Palette lock.** No neon `#00F0FF`. Cyan accent is `#65def0`. OKLCH chroma ≤ 0.16. **One** chromatic accent system (cyan voice + amber/green/red semantic). No AI purple/blue gradient, no second accent.
7. **Tailwind v4 via `@theme` in `frontend/src/styles/globals.css`** — there is **no** `tailwind.config.ts`. Add design tokens as `--color-*` / `--*` custom properties there; `DESIGN.md` is the human spec to keep in sync.
8. **Motion.** `prefers-reduced-motion` already kills scanlines/glitch/typewriter — **extend it to any new motion.** GPU-only (`transform`/`opacity`). Don't out-animate the game; the web is the *quieter* surface (`PRODUCT.md` Principle #3).
9. **Plyr is never unmounted** after init (removeChild crash) — only hidden.
10. **Mobile-first reading.** Body 16–17px, measure < 65ch on phones too, no horizontal scroll outside intentional carousels. Layout must breathe for Cyrillic (~10–15% wider).
11. **Visual-regression baselines (Q1).** Intentional UI changes will fail the `toHaveScreenshot` gate until baselines are refreshed via `--update-snapshots` (Linux baselines are CI-seeded — see `docs/deploy/visual-regression.md`).

## Where to work

| Layer | Path |
|---|---|
| Design tokens | `frontend/src/styles/globals.css` (`@theme`) ↔ `DESIGN.md` (spec) |
| Page structure / SSR | `backend/templates/*.html` (`home.html`, `guide.html`, `journal.html`, `course.html`, `check.html`, `inspect.html`, `base.html`) |
| Interactive islands | `frontend/src/components/*.tsx` |
| Copy | `backend/locales/{en,ru}.json` (+ `scripts/i18n_allowlist.txt` for dynamic keys) |

## How to verify a design pass (before claiming done)

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test   # type + build + unit; commit rebuilt backend/static
cd .. && backend/.venv/bin/python -m pytest -q                 # backend green
backend/.venv/bin/python scripts/i18n_audit.py                 # 0 dead / 0 missing / en==ru
cd e2e && npx playwright test a11y.spec.ts                     # axe 7/7 with color-contrast ENFORCED
cd e2e && npx playwright test visual.spec.ts -c visual.config.ts --update-snapshots  # refresh baselines for intentional UI changes
```
Then screenshot the changed pages RU/EN × desktop/mobile and confirm the *only* diffs are the ones you intended.

## Suggested order (max impact, min risk)

1. **Break the home 3-card monotony** (P0) — one asymmetric/featured stream layout. Biggest single de-slop win.
2. **Vary section rhythm + cut decorative chrome** (P0/P1) — let the page breathe unevenly; reserve terminal chrome for where it means something.
3. **Type hierarchy** (P1) — Geist for editorial display, mono for data/voice; add 500/600 weights; balance/pretty wrapping; cap measure.
4. **Depth + asymmetry** (P1) — overlap, tinted shadows, role-differentiated cards, varied radius.
5. **Stat truth + subtle texture** (P2) — real numbers only; quiet grain/grid on flat darks.
6. **Micro-craft** (P3) — optical alignment, spring easing, staggered reveals (reduced-motion-safe).

Keep changes small and reviewable; verify after each. The concept is strong — this pass is about **cadence, hierarchy, and restraint**, not reinvention.
