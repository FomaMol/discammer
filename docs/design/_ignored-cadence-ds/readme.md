# Cadence Design System

**Cadence** is a calm daily-planning dashboard for people with AuDHD (autism + ADHD).
Tagline: *your day, in rhythm.* The system exists to **lower cognitive load**: predictable
patterns, one clear accent per screen, generous spacing, obvious focus states, restrained
motion, and time-perception aids (timers, rings, "how much is left").

This project IS the design system the compiler ships. There is no external codebase or
Figma — the brand was created from scratch against the brief. If a source file or link is
added later, record it here so future readers can find it.

> **Sources:** none provided. Brand, tokens, components and the dashboard UI kit are all
> original to this project.

---

## Design principles (for neurodivergent users)
1. **One main accent per screen.** A single muted indigo action; everything else is quiet.
2. **Predictable, repeating patterns.** Same component, same place, same behaviour.
3. **Always-visible focus & action states.** One 2px focus ring + soft halo, everywhere.
4. **Restrained motion.** 120–320ms ease-out, no autoplay / flashing / bounce. Honours
   `prefers-reduced-motion` (collapses to ~instant).
5. **Large, comfortable hit areas.** 44px minimum (`--hit-min`).
6. **Calm, non-alarming feedback.** Soft semantic colours; toasts reassure, never shout.
7. **Time made visible.** Timers, progress bars and rings answer "how much is left?".

---

## CONTENT FUNDAMENTALS — how Cadence writes

- **Voice:** warm, plain, second person ("you"). Speaks *with* the user, never *at* them.
- **Tone:** gentle and steady. Lowers pressure. Celebrates small wins; never guilt-trips a
  missed task. Example: *"No problem. We'll keep it in your routine and bring it back tomorrow."*
- **Casing:** sentence case everywhere — buttons, titles, labels, menus. No ALL-CAPS shouting
  (the only uppercase is small eyebrow labels with wide tracking, used sparingly).
- **Length:** short. One idea per line. Prefer a 3-word button to a 6-word one.
  *"Add a task"*, *"Open focus mode"*, *"Keep it"*, *"Skip for today"*.
- **Numbers & time:** concrete and visible — *"45 min"*, *"2 of 4 done"*, *"9:00 AM"*, *"5 min left"*.
  Tabular mono figures so they don't jump.
- **Reassurance over urgency:** *"A gentle pause is coming up."* not *"Break NOW!"*.
  Empty states frame rest as part of the plan: *"Rest is part of the rhythm too."*
- **Emoji:** none. They add sensory noise and ambiguity. Use Lucide icons instead.
- **Punctuation:** minimal. No exclamation overload, no ALL-CAPS, no "!!!".

---

## VISUAL FOUNDATIONS

- **Mood:** Linear / Vercel restraint, but **warmer and softer**. Technological yet gentle.
- **Colour:** dark theme is default; light theme is a first-class peer (toggle via
  `data-theme="light"` on `<html>`). A single low-chroma **violet-tinted neutral ramp** powers
  both themes through semantic aliases (`--bg-base`, `--surface-1..3`, `--text-strong/body/muted/subtle`).
  The accent is a **muted indigo-violet (~282°), never neon** — `--accent-400` in dark,
  `--accent-600` in light. Semantic colours (success sage, warning amber, error rose, info
  periwinkle) are soft and used as tinted fills + readable text, meeting WCAG AA without harsh
  black/white pairs. Never `#000`/`#fff`. All ramps authored in **OKLCH** for even steps.
- **Type:** **Onest** (geometric grotesk, legibility-tuned) for UI/display; **JetBrains Mono**
  for numbers, timers and durations (tabular figures). Four weights only (400/500/600/700).
  Generous line-height (**1.55 body**, up to 1.7 for long-form). Slight negative tracking on
  large display only. Strict hierarchy: display → h1 → h2 → h3 → body → label → caption.
- **Spacing:** strict **4px grid** (`--space-1..24`). Balanced density — never crowded, never sparse.
- **Radii:** soft and friendly — **12–16px core** (`--radius-md` 12, `--radius-lg` 16 for cards),
  with 6/8 for small chips/inputs and `full` for pills/avatars/rings.
- **Cards:** `--surface-1`, 16px radius, 1px subtle border, **soft multi-layer shadow** +
  a faint inset top highlight (`--shadow-raise`) so raised dark surfaces lift without hard edges.
- **Elevation:** five gentle levels (`--shadow-xs..xl`), wide blur + low opacity. In light theme
  shadows tint with the neutral hue rather than pure black.
- **Borders:** hairline, low-opacity (`--border-subtle/default/strong`) — structure without noise.
- **Backgrounds:** flat solid surfaces. **No gradients, no textures, no imagery behind content.**
  The one permitted blur is a translucent sticky header (`backdrop-filter`) over `--bg-base`.
- **Motion:** fades + 6px rise on overlays (`cds-fade`, `cds-rise`); width/stroke transitions on
  progress. Easing `--ease-out` / `--ease-standard`. No infinite loops, no parallax, no bounce.
- **Hover:** surfaces step up one level (e.g. `surface-2 → surface-3`); primary button lightens
  to `--accent-hover`. **Press:** 1px `translateY` nudge (no shrink), button darkens to
  `--accent-active`.
- **Focus:** identical treatment system-wide — 2px `--focus-ring` outline, 2px offset; fields add
  a soft `--shadow-focus` halo. Never removed.
- **Transparency/blur:** used only for the modal scrim and the sticky header. Content stays opaque.

---

## ICONOGRAPHY

- **Library:** [Lucide](https://lucide.dev) — rounded line icons, **stroke-width 1.75** (softer
  than the 2.0 default), sizes **20–24px**. Friendly geometry suits the calm brand.
- **In specimen cards / standalone HTML:** loaded from CDN
  (`https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`) and rendered via
  `lucide.createIcons({ attrs: { "stroke-width": 1.75 } })`.
- **In React (UI kit):** a curated subset of Lucide paths is inlined in
  `ui_kits/dashboard/Icon.jsx` (`<Icon name="timer" />`) to render reliably under React
  re-renders without DOM-replacement glitches. Add icons by copying their Lucide paths in.
- **Components:** small functional glyphs (checkmark, chevron, close, play/pause, toast status)
  are inlined directly in the component JSX so primitives have **no runtime icon dependency**.
- **No emoji. No unicode-as-icon.** Logo mark is the only bespoke SVG.

---

## INDEX / manifest

**Root**
- `styles.css` — global entry point (import this one file). `@import`s the token layer.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skill front-matter for use in Claude Code.

**Tokens** (`tokens/`, all reached from `styles.css`)
- `colors.css` — neutral / accent / semantic ramps (OKLCH) + dark & light semantic aliases.
- `typography.css` — Onest + JetBrains Mono, scale, weights, leading, role fonts.
- `spacing.css` — 4px spacing scale, radii, hit target, layout sizes.
- `elevation.css` — shadow levels (per theme) + motion tokens + reduced-motion handling.
- `base.css` — resets, body defaults, focus-visible, scrollbars.
- `components.css` — class-based component styles (all interactive states).

**Foundation cards** (`guidelines/cards/`) — specimens shown in the Design System tab
(Colors, Type, Spacing, Brand).

**Components** (`components/`) — React primitives, each `Name.jsx` + `Name.d.ts` (+ some `.prompt.md`):
- `forms/` — Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider
- `display/` — Card, Badge, Tag, Avatar, Chip
- `navigation/` — Sidebar, Tabs, Breadcrumbs
- `data/` — Table, List
- `feedback/` — Dialog, Popover, Tooltip, Toast
- `day/` — Checklist, ProgressBar, ProgressRing, Timer, DayChart, EmptyState

**UI kit** (`ui_kits/dashboard/`) — interactive Cadence dashboard recreation:
Today, Routines, Focus, Progress, with theme toggle. `index.html` is the entry.

**Assets** (`assets/`) — `logo-mark.svg`, `logo-wordmark.svg`.

> Components are consumed as `window.CadenceDesignSystem_9c64df.<Name>` after loading
> `_ds_bundle.js` (generated by the compiler — do not edit by hand).

---

## CAVEATS / font substitution
- **Fonts are loaded from Google Fonts** (Onest, JetBrains Mono) via `@import` in
  `typography.css`. No binary font files are bundled, so the compiler reports "0 fonts".
  If you want self-hosted fonts, drop the `.woff2` files in `assets/fonts/` and add
  `@font-face` rules — flag if you have licensed files to use instead.
