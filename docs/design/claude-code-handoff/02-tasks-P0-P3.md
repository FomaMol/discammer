# 02 · Tasks by priority (P0 → P3)

The audit from `deslop-handoff.md`, turned into owned, file-scoped, checkable tasks. Each is one
branch. **Owner** is the lead agent for the task; collaborators in parens. Don't widen scope:
a small ask changes only what it names.

---

## P0 — the strongest slop tells

### P0-1 · Break the home three-card monotony
> Three consecutive rows of three equal cards is *the* generic-AI layout. Give each journal stream
> a different shape.

- **Owner:** A2 (with A5 for the carousel/broadsheet islands)
- **Files:** `backend/templates/home.html`, `frontend/src/components/ContentCarousel.tsx`,
  `frontend/src/components/JournalBroadsheet.tsx`
- **Do:** interviews → featured-lead + smaller siblings (asymmetric / zigzag); newsletters → a tight
  dated text list (no thumbnails); articles → 2-up with one larger hero card. Vary card heights with
  content; stop forcing equal heights.
- **Done when:** no two consecutive home sections share the same grid; at least one stream is a
  non-card layout; visual.spec baseline refreshed; reviewer can't call it "three equal cards".

### P0-2 · Vary section rhythm + temperature
> Every block opens with the same `// SECTION_LABEL` eyebrow at the same width/spacing.

- **Owner:** A2 (with A1 on spacing tokens)
- **Files:** `backend/templates/home.html` (+ shared section partials if present)
- **Do:** let one or two sections run full-bleed / asymmetric; let one breathe with much more
  whitespace; don't give *every* section the terminal-label treatment. Editorial cadence: loud → quiet → loud.
- **Done when:** vertical rhythm visibly varies section-to-section; not every section has the mono eyebrow.

---

## P1 — strong tells

### P1-1 · Cut decorative chrome (costume → meaning)
- **Owner:** A2 (with A1)
- **Files:** `home.html`, `guide.html`, `journal.html`, the components that emit `//`, `>`, `_`, case-IDs
- **Do:** keep terminal/case-file chrome only where it carries meaning (analyzer, threat meter, guide
  case-file strip, game launcher). Strip it from journal listings (quieter editorial). Less chrome, more contrast where it remains.
- **Done when:** chrome density drops on reading surfaces; `PRODUCT.md` principle #1 holds.

### P1-2 · Type hierarchy (Geist editorial vs mono data)
- **Owner:** A3
- **Files:** `globals.css` (`@theme` type tokens), `base.html` (font loading), `guide.html`,
  `post.html`, `journal.html`, `course.html`
- **Do:** Geist carries editorial display on journal/articles/guides; reserve mono for
  data/terminal/voice (analyzer, metadata, wordmark, case files). Add **500/600** weights. Tighten
  tracking on large display, cap measure ~65ch, `text-wrap: balance` on headlines / `pretty` on body.
- **Done when:** article/guide h1 is sentence-case Geist (or sentence-case mono per spec), mono no
  longer carries every headline; no orphans; measure ≤ 65ch on desktop and phone.

### P1-3 · Depth + asymmetry
- **Owner:** A2 (with A1 on shadow tokens)
- **Files:** `globals.css` (tinted shadows), card components, `home.html`, `guide.html`
- **Do:** break symmetry deliberately (offset headers, off-grid bleed); negative-margin overlap (case-file
  strip over the title block); differentiate cards by role; vary radius (tighter inner / softer container);
  **tinted** shadows that carry the canvas blue, never pure black.
- **Done when:** at least one intentional overlap ships; shadows are blue-tinted; featured vs list cards
  are visually distinct.

---

## P2 — polish

### P2-1 · Stat truth + specificity
- **Owner:** A3/content (with A5 for any live values)
- **Files:** `home.html` HUD, locales
- **Do:** every number must be **true and specific** (real guide count, real lessons, real
  last-updated time) or it goes. Replace `24/7` with something concrete ("last threat logged 3h ago").
- **Done when:** no round/placeholder metrics; no `24/7`; numbers are tabular mono.

### P2-2 · Subtle texture on flat darks
- **Owner:** A4 (with A1)
- **Files:** `ParticleBackground.tsx` / a grain util, `globals.css`
- **Do:** a fixed `pointer-events:none` grain at very low opacity, or extend the 40px hairline grid to
  one or two more surfaces. Quiet — briefing room, not the game. Respect reduced-motion; no ambient
  motion on reading surfaces.
- **Done when:** flat dark sections read finished, not sterile; reduced-motion shows a static texture.

---

## P3 — micro-craft

### P3-1 · Micro-craft pass
- **Owner:** A4 (with A1)
- **Files:** motion utils, icon+label pairs across templates/components
- **Do:** optical alignment on icon+label and the `>` arrow; consistent Phosphor stroke weight;
  audit hover/active/focus for 200–300ms `transform`/`opacity` easing; staggered scroll-entry instead
  of everything mounting at once.
- **Done when:** reveals are staggered + reduced-motion-safe; states use the one easing curve; icons optically aligned.

---

## New surfaces introduced by the redesign (build to the same bars)

| Surface | Owner | Notes |
|---|---|---|
| **Inspect** (`/inspect`, `inspect.html`) | A5 (with A2) | Privacy-first **link** inspector — parses a URL in-browser, never opens it; names tells (lookalike domain, `@`, raw IP, punycode, shortener, sketchy TLD), points to the phishing guide. axe-gated. |
| **Check** (`/check`, `check.html`) | A5 (with A2) | Message first-pass analyzer (urgency/move-money/code/link heuristics). Distinct from Inspect. |
| **Search** | A5 | Live client-side index over guides + journal + course + tools. Inline (a nav icon + a results page), not a modal. |
| **Game launcher** (`game.html`) | A4 (with A2) | The one place the deepest cyberpunk is allowed — CRT/scanline moment, gated by reduced-motion. Don't out-game the game elsewhere. |

> Reminder: each new interactive widget = `.tsx` in `components/` + a `main.tsx` registry entry +
> a `<div data-component=… data-props=…>` mount in the template, then `npm run build` + commit `backend/static/`.
