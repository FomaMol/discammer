# 02 — Tasks (v2 implementation, P0→P3)

Work targets the **production v1 stack** (Jinja SSR + React islands + Tailwind v4). v1 is live; v2 is
an incremental, reviewable evolution — not a rewrite. Each task names its files, owner, dependencies,
and acceptance criteria. Port decisions from `../../DiScammer v2.dc.html`; don't re-invent them.

> Branch flow: token tasks (P0) land first; everything else rebases on them. One PR per task.
> Every PR: `npx tsc --noEmit && npm run build && npm test` + i18n audit + a11y green before merge.

---

## P0 — Foundations (block everything else)

### T0.1 — Tokens & texture layer (A1)
- Add v2 additions to `frontend/src/styles/globals.css` `@theme`: `--shadow-panel`, `--shadow-pop`
  (both tinted blue, never black), the `--grain` SVG-noise utility (≤3% opacity, `code-bg` only),
  and document them in `DESIGN.md`.
- **Accept:** tokens resolve; no value drift on the locked palette; `DESIGN.md` ↔ `globals.css` in sync.

### T0.2 — Fonts & the two-register rule (A2)
- Self-host Geist + JetBrains Mono (full Cyrillic), `@font-face` + `font-display:swap` + preconnect.
  Add weight 500/600 to the Geist load. Remove any Inter/pixel loader.
- Encode the **two-register rule** as utility classes/role tokens: `.t-data` (mono) vs `.t-editorial`
  (Geist), so components can't mix them by accident.
- **Accept:** body renders pure Geist Cyrillic (not fallback); Latin/Cyrillic x-height parity at 24px;
  Lighthouse shows no render-blocking font; FOUT acceptable, no layout shift.

---

## P1 — The UX-clarity moves (the heart of v2)

### T1.1 — Promote the live checker into the hero (A3 + A4)
- New/!moved island `MessageChecker.tsx` rendered in `home.html` hero right column. Reuse v1's
  inspector heuristics; runs fully client-side; privacy line always visible.
- Wire the **detection→learning loop** (senior-review blocker): a HIGH/SUSPICIOUS result renders a
  button linking to the matching guide ("looks like a phishing pattern → 60-second response").
- Add `aria-live="polite"` on the result region so SR users hear tells appear.
- **Accept:** keyboard-only user can paste, read result, and reach the guide; axe clean; result
  announced; nothing leaves the browser (verify in Network tab).

### T1.2 — "Three ways in" clarity band (A3)
- New island/partial `ThreeWaysIn.tsx` under the hero in `home.html`: Learn / Check / Practice, each a
  real `<a>` with verb (mono), one line (Geist), trailing `→`, ≥44px hit area.
- **Accept:** three links keyboard-reachable with visible focus; reads in <5s; RU/EN authored.

### T1.3 — Retire the A/B home; ship one decisive home (A0 + A3)
- Production renders the single v2 home. The A/B "rhythm" switcher is a design-review tool only and
  **must not exist in prod templates**.
- **Accept:** no `RHYTHM A/B` control anywhere in `backend/templates/`.

### T1.4 — Breadcrumbs + active nav + global focus (A3)
- `Breadcrumbs.tsx` (or SSR partial) on every inner page; active nav underline; the global
  `:focus-visible` cyan ring in `base.css`; skip-to-content link in `base.html`.
- **Accept:** every interactive element shows the focus ring; breadcrumb on guide/article/inspect/
  search/course; skip link is the first tab stop.

### T1.5 — Threat-meter: word + number always (A3)
- Meter component renders `bars + "LVL n/5" + WORD` (CRITICAL/HIGH/ELEVATED/GUARDED/LOW); color is
  signal #3; `aria-label="threat level n of 5"`.
- **Accept:** passes a grayscale screenshot test (meaning survives without hue); word never truncates
  before bars at 320px.

### T1.6 — Reusable "DO THIS TODAY" action-module (A3 + A5)
- One `ActionModule.tsx` ending every content page with a single concrete action (PRODUCT.md
  Principle #5). Replaces ad-hoc CTA blocks.
- **Accept:** present on guide + article + inspect + course; one primary button each; RU/EN authored.

---

## P2 — Rhythm, depth, texture, truth

### T2.1 — Section-rhythm pass (A1) — alternate HEADER/FEATURE/QUIET-LIST/DATA-WALL/CTA-BAND; let one
  feature break the container for a true scroll peak (senior-review should-fix).
### T2.2 — Depth + tinted shadows (A1) — featured cards use `--shadow-panel`; verify none are pure black.
### T2.3 — Texture on the right surfaces only (A1) — `--grain` on terminal wells; grid-40 on
  hero/game/CTA-band; never behind body text.
### T2.4 — Stat truth (A5) — every number real (guide count, last-updated, module count); kill any
  round/placeholder metric; no `24/7`.

## P3 — Motion & micro-craft

### T3.1 — Motion tiers (A4) — ambient (canvas), entrance (staggered reveals + meter fill + progress),
  feedback (hover/press/focus). All `prefers-reduced-motion` mapped. GPU-only.
### T3.2 — WebGPU evaluation (A4) — spike a gated, reduced-motion-safe WebGPU hero field; ship only if
  it stays ≤ the game's intensity and degrades to Canvas2D cleanly. Default: keep Canvas2D.
### T3.3 — Micro-craft (A1) — optical alignment on `>`/icon+label/`→`; Phosphor stroke parity; spring-
  free easing 180–260ms.

---

## Definition of done (per the senior review)
- 3 blockers cleared: no A/B in prod · checker result `aria-live` + keyboard path · RU parity of all
  new strings.
- Detection→learning loop wired. Clean-state copy softened ("not the same as safe").
- All CI gates green (`03-verification.md`). Visual-regression baselines refreshed only for intended diffs.
