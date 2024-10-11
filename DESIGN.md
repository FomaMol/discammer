---
version: 1.0
name: DiScammer-design-system
description: An anti-fraud education platform visualized as the analyst's briefing room — a tuned cool-dark canvas, a single chromatic accent system (cyan / amber / green / red, each tied to meaning, not decoration), JetBrains Mono as the only typographic voice carrier (no pixel-arcade font, no Inter), and chrome that earns its cyberpunk presence by representing real fraud-investigation metadata rather than wallpaper. Tightly aligned with the in-browser game "Antifraud Hero" without trying to out-game it.

# Theme decision (the scene sentence)
# "A junior fraud analyst at a monitoring console at 11pm in a dim office, scanning incident reports across two displays, coffee gone cold." Forces dark theme; forces dense-but-readable; forces monospaced metadata; forbids LARP-pixel-arcade chrome.

# Register: brand. This is the marketing/educational surface for DiScammer. Cards, decoration, motion all serve impression first, transaction second. See PRODUCT.md for strategic context.

# Color strategy: Committed. One canvas (cool tinted dark), one chromatic accent system (cyan as the brand voice carrier), three semantic accents (amber/green/red) that derive meaning from the fraud-investigation context — they are not interchangeable mood colors. Saturation kept ≤ 0.16 chroma in OKLCH to avoid the oversaturated "neon-on-black" cyberpunk reflex.

colors:
  # Canvas (warm-cool tinted dark — not pure black, not generic navy)
  canvas:        "#0b0f1a"   # oklch(15.2% 0.014 248) — primary page background
  canvas-soft:   "#121828"   # oklch(20.0% 0.018 250) — card / panel fill
  canvas-raised: "#1a2236"   # oklch(25.5% 0.022 252) — popovers, hover state
  canvas-input:  "#1e2740"   # oklch(28.0% 0.027 254) — input + button hover

  # Hairlines (carry the tint, never neutral gray)
  hairline:        "#202a44"  # oklch(28.0% 0.034 256) — default 1px divider
  hairline-strong: "#2b3759"  # oklch(35.5% 0.046 256) — emphasized divider
  hairline-glow:   "rgba(101, 222, 240, 0.18)"  # cyan-tinted edge for active elements

  # Text (tinted toward canvas — never pure #fff)
  ink:           "#e7ecf5"   # oklch(93.5% 0.012 250) — primary body, headlines
  ink-strong:    "#f3f5fa"   # oklch(96.5% 0.008 250) — display headlines only
  ink-soft:      "#aab2c4"   # oklch(74.0% 0.016 250) — secondary body, descriptions
  ink-mute:      "#8b94a8"   # metadata, captions, timestamps — lifted from #6b7588 for WCAG AA (≥4.5:1 on all canvas surfaces incl. canvas-input)
  ink-faint:     "#8b94a8"   # placeholders, disabled text — lifted from #475064 for WCAG AA (#475064 failed even 3:1); text-bearing faint now equals ink-mute
  ink-dim:       "#6b7588"   # NON-TEXT / decorative only (large/aria-hidden glyphs, hairlines) — meets the 3:1 non-text bar, never use for body text

  # Brand accent — cyan as the voice carrier (tuned down from #00F0FF for sophistication)
  cyan:          "#65def0"   # oklch(83.0% 0.094 217) — primary accent (links, brand wordmark glow, focus rings, "INTERVIEW" badges)
  cyan-strong:   "#9eecf6"   # oklch(89.5% 0.072 217) — hover on cyan elements
  cyan-dim:      "#3a8b9a"   # oklch(60.0% 0.072 217) — pressed state, secondary cyan
  cyan-veil:     "rgba(101, 222, 240, 0.08)"  # background tint for active rows

  # Semantic accents — each tied to a fraud-investigation meaning. Not interchangeable.
  amber:         "#f4b965"   # oklch(81.5% 0.118 70) — warnings, "ARTICLE" badge, threat-level 3
  amber-veil:    "rgba(244, 185, 101, 0.10)"

  green:         "#7ce896"   # oklch(85.0% 0.140 145) — safe / verified / "NEWSLETTER" badge / threat-level 1-2
  green-veil:    "rgba(124, 232, 150, 0.10)"

  red:           "#e76670"   # oklch(67.0% 0.158 22) — confirmed fraud, "SCAM GUIDE" badge, threat-level 5
  red-veil:      "rgba(231, 102, 112, 0.10)"

  # Code surfaces (JetBrains Mono on these)
  code-bg:       "#0a0d16"   # oklch(13.0% 0.012 248) — code blocks, terminal blocks
  code-syntax-keyword: "#65def0"   # cyan
  code-syntax-string:  "#7ce896"   # green
  code-syntax-comment: "#475064"   # ink-faint

typography:
  # Two families. No third. No pixel-arcade font.
  family-sans:    "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
  family-mono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, 'Cascadia Code', monospace"

  # Display roles use mono (JetBrains Mono); body uses sans (Geist).
  # The brand voice is "analyst-at-console", so mono carries identity — but body reads as Geist for long-form articles.

  display-hero:
    family: family-mono
    sizeClamp: "clamp(2.5rem, 1.6rem + 4.5vw, 4.5rem)"
    weight: 800
    tracking: -0.04em
    leading: 0.96
    transform: uppercase
    notes: "Logo wordmark + page-h1. JetBrains Mono 800 not 400. Negative tracking. Uppercase. Single solid color (cyan or ink) — never gradient-text."

  display-section:
    family: family-mono
    sizeClamp: "clamp(1.5rem, 1.1rem + 2vw, 2.25rem)"
    weight: 700
    tracking: -0.02em
    leading: 1.05
    transform: uppercase
    notes: "Section labels: '> INTERVIEW_LOG', '> THREAT_DATABASE'. Mono uppercase. The `>` is literal narrative, not a CSS pseudo-element trick."

  display-card:
    family: family-mono
    size: "1.0625rem"   # 17px
    weight: 700
    tracking: -0.01em
    leading: 1.25
    notes: "Card headlines (post titles in carousels)."

  display-article:
    family: family-mono
    sizeClamp: "clamp(1.75rem, 1.3rem + 1.8vw, 2.5rem)"
    weight: 700
    tracking: -0.02em
    leading: 1.15
    transform: none
    notes: "Article / post / guide page h1. Sentence-case (NOT uppercase) — it's a reading surface, not a brand surface."

  body-lead:
    family: family-sans
    size: "1.125rem"    # 18px
    weight: 400
    leading: 1.6
    maxWidth: "62ch"
    notes: "Lead paragraph below article h1. Geist 400."

  body-base:
    family: family-sans
    size: "1rem"        # 16px
    weight: 400
    leading: 1.7
    maxWidth: "65ch"
    notes: "Body copy in articles and on marketing pages. Geist 400, generous leading."

  body-small:
    family: family-sans
    size: "0.9375rem"   # 15px
    weight: 400
    leading: 1.55
    notes: "Card descriptions, secondary body."

  ui-label:
    family: family-mono
    size: "0.6875rem"   # 11px
    weight: 600
    tracking: 0.14em
    transform: uppercase
    notes: "Badges (INTERVIEW / NEWSLETTER / ARTICLE / SCAM GUIDE), button labels, nav links. Mono uppercase widely tracked."

  ui-meta:
    family: family-mono
    size: "0.75rem"     # 12px
    weight: 500
    tracking: 0.02em
    notes: "Dates, slugs, IP-style metadata, breadcrumb path segments. Tabular figures."

  code:
    family: family-mono
    size: "0.875rem"    # 14px
    weight: 400
    leading: 1.6
    notes: "Inline code, terminal block body, JSON snippets."

spacing:
  # 4px base. Limited tokens — most layouts hit five or six of these.
  px:     "1px"
  xs:     "0.25rem"   # 4
  sm:     "0.5rem"    # 8
  md:     "0.75rem"   # 12
  base:   "1rem"      # 16
  lg:     "1.5rem"    # 24
  xl:     "2rem"      # 32
  2xl:    "3rem"      # 48
  3xl:    "4.5rem"    # 72
  4xl:    "6rem"      # 96
  5xl:    "8rem"      # 128 — only for hero / page-break sections

  # Fluid section padding (rhythm, not monotony)
  section-y-tight:   "clamp(2.5rem, 5vw, 4rem)"
  section-y-default: "clamp(4rem, 8vw, 7rem)"
  section-y-hero:    "clamp(5rem, 11vw, 10rem)"

  # Content container — narrower than the trend; this is a reading surface
  container:         "min(72rem, calc(100vw - 2rem))"   # 1152px max
  container-narrow:  "min(44rem, calc(100vw - 2rem))"   # 704px max — articles, guides

radius:
  # Tight. Cyberpunk + analyst-console = mostly rectangular. Pills only for status indicators.
  none:  "0"
  xs:    "2px"
  sm:    "3px"
  md:    "4px"
  lg:    "6px"
  pill:  "9999px"

elevation:
  # Hairline-first. Glow only when functional (focus, active threat).
  flat:     "none"
  hairline: "0 0 0 1px var(--color-hairline)"
  card:     "0 1px 0 0 var(--color-hairline), 0 0 0 1px var(--color-hairline)"
  hover:    "0 0 0 1px var(--color-cyan-dim), 0 8px 24px -8px rgba(0,0,0,0.5)"
  focus:    "0 0 0 2px var(--color-canvas), 0 0 0 4px var(--color-cyan)"
  glow-cyan:  "0 0 0 1px var(--color-cyan-dim), 0 0 24px -4px var(--color-cyan-veil), inset 0 0 0 1px rgba(101,222,240,0.06)"
  glow-amber: "0 0 0 1px rgba(244,185,101,0.4), 0 0 24px -4px var(--color-amber-veil)"
  glow-red:   "0 0 0 1px rgba(231,102,112,0.4), 0 0 24px -4px var(--color-red-veil)"

motion:
  # No bounce, no elastic, no spring. Ease-out-quart everywhere.
  ease-out:  "cubic-bezier(0.16, 1, 0.3, 1)"
  duration-instant: "100ms"
  duration-quick:   "180ms"
  duration-base:    "260ms"
  duration-slow:    "420ms"

components:
  # === Navigation ===
  nav-bar:
    background: "color-mix(in srgb, var(--color-canvas) 86%, transparent)"
    backdropFilter: "blur(10px) saturate(140%)"
    height: "3.5rem"
    borderBottom: "1px solid var(--color-hairline)"
    typography: ui-label
    padding: "0 var(--container-x)"

  nav-link:
    typography: ui-label
    color: ink-soft
    padding: "var(--space-sm) var(--space-md)"
    radius: sm
    activeBorderBottom: "2px solid var(--color-cyan)"
    activeColor: ink-strong

  # === Buttons (no gradient fills, tight radius, mono labels) ===
  button-primary:
    background: cyan
    color: canvas
    typography: ui-label
    padding: "0.75rem 1.5rem"
    radius: md
    hover: "background: cyan-strong; transform: translateY(-1px);"
    active: "transform: translateY(0); background: cyan-dim;"
    focus: "elevation.focus"
    notes: "Used sparingly — one per section. Solid cyan, dark text. No glow by default — glow appears on focus only."

  button-secondary:
    background: transparent
    color: ink
    border: "1px solid var(--color-hairline-strong)"
    typography: ui-label
    padding: "0.75rem 1.5rem"
    radius: md
    hover: "border-color: cyan-dim; color: cyan-strong; background: cyan-veil;"
    notes: "Default for tertiary actions, secondary CTAs."

  button-ghost:
    background: transparent
    color: ink-soft
    typography: ui-label
    padding: "0.5rem 0.75rem"
    radius: sm
    hover: "color: ink; background: canvas-soft;"
    notes: "Nav-style buttons, in-card actions."

  # === Cards (the workhorse — refined to escape "icon-title-text" template) ===
  card-base:
    background: canvas-soft
    border: "1px solid var(--color-hairline)"
    radius: lg
    padding: "var(--space-lg)"
    transition: "border-color 260ms var(--motion-ease-out), background 260ms var(--motion-ease-out)"
    hover: "border-color: cyan-dim; background: canvas-raised;"
    notes: "Default. No drop shadow. No glow on default state — glow only when hovered AND the card represents an active threat or featured post."

  card-post:
    extends: card-base
    coverAspectRatio: "16 / 10"
    metaPlacement: "top-left of cover (overlay), date in mono uppercase tracking"
    badgePlacement: "top-right of cover"
    titlePlacement: "below cover with --space-md padding-top"
    notes: "Used in journal grid + home carousels. The cover image gets a `filter: saturate(0.85) contrast(1.05)` to unify visual tone across third-party headshots."

  card-threat:
    extends: card-base
    iconSize: "2rem"
    iconColor: "amber"
    threatBarPlacement: "below title — 5 vertical slats, filled per threat level"
    notes: "Used in threat database (scam-types grid). The icon is functional (specific to the scam type), not decorative."

  card-bento-featured:
    extends: card-base
    background: canvas-raised
    border: "1px solid var(--color-cyan-dim)"
    padding: "var(--space-xl)"
    notes: "Used in bento layouts where one card is the featured item (e.g., latest interview on home, recommended next module on course)."

  # === Terminal block (analyst's monitor) ===
  terminal-block:
    background: code-bg
    border: "1px solid var(--color-hairline)"
    borderTop: "1.5rem solid transparent"
    headerBackground: "linear-gradient(to right, var(--color-canvas-raised), var(--color-canvas-soft))"
    headerHeight: "1.5rem"
    headerDots: "three 8px circles in --color-hairline-strong, ink-mute, ink-mute (NOT macOS red-yellow-green)"
    padding: "var(--space-lg)"
    typography: code
    color: ink-soft
    cursorColor: cyan
    notes: "Used for: About Us, featured quotes in articles, scam-script reproductions in guides. NOT for every section heading. Maximum 1-2 per page or it loses meaning."

  # === Badges (always color + label + role attribute) ===
  badge-interview:  { background: cyan-veil,  color: cyan,    border: "1px solid color-mix(in srgb, var(--color-cyan) 40%, transparent)" }
  badge-newsletter: { background: green-veil, color: green,   border: "1px solid color-mix(in srgb, var(--color-green) 40%, transparent)" }
  badge-article:    { background: amber-veil, color: amber,   border: "1px solid color-mix(in srgb, var(--color-amber) 40%, transparent)" }
  badge-guide:      { background: red-veil,   color: red,     border: "1px solid color-mix(in srgb, var(--color-red) 40%, transparent)" }
  badge-padding:    "0.25rem 0.5rem"
  badge-radius:     xs
  badge-typography: ui-label

  # === Carousel ===
  carousel:
    layout: "horizontal scroll-snap container, hide scrollbar"
    arrows: "absolute-positioned, ghost button style, visible on hover (desktop) / always (mobile)"
    cardGap: "var(--space-lg)"
    cardWidth: "min(20rem, 75vw)"
    scrollPadding: "var(--container-x)"
    notes: "Default to native scroll-snap, not JS-driven slider. Mobile: cards reveal half of the next one to communicate scrollability."

  # === Hero (left-aligned with system-metadata strip on right) ===
  hero:
    layout: "asymmetric — content max-width 38rem on the left, mono metadata strip on the right (desktop only, stacks mobile)"
    background: "canvas + faint grid-pattern + (optional) particle field at MOTION_INTENSITY ≥ 6"
    metadataStrip:
      typography: ui-meta
      color: ink-mute
      items: "status indicator (live dot + 'MONITORING'), today's date in ISO, last-updated-content timestamp"
    notes: "NO centered stack. NO Press Start 2P. NO 'TYPE TO BEGIN' typewriter under the title — the typewriter (if used) appears in a smaller secondary line below the actual CTAs, like a console subscription feed: '> tracking_threats: PHISHING / DEEPFAKE_VOICE / TRUST_BAIT'."

  # === Article surface (post.html, guide.html) ===
  article:
    container: container-narrow
    h1: display-article
    leadParagraph: body-lead
    body: body-base
    h2: { typography: display-section, transform: none, color: cyan, marginTop: "var(--space-2xl)" }
    h3: { typography: display-card, color: green, marginTop: "var(--space-xl)" }
    h4: { typography: display-card, color: amber, marginTop: "var(--space-lg)" }
    blockquote: { borderLeft: "2px solid var(--color-amber)", background: amber-veil, padding: "var(--space-md) var(--space-lg)", italic: true }
    listMarker: "▸ in cyan (ul), tabular mono numerals in cyan (ol)"
    code: { background: code-bg, color: cyan, radius: xs, padding: "0.1em 0.4em", border: "1px solid var(--color-hairline)" }

  # === Footer ===
  footer:
    background: canvas-soft
    borderTop: "1px solid var(--color-hairline)"
    padding: "var(--section-y-tight) 0 var(--space-xl)"
    columns: "3 max (not 4) — Threat Database / Journal / Course"
    typography-link: body-small
    typography-meta: ui-meta
    notes: "Logo wordmark + tagline in left column. Right column: language switch + a single 'Report a scam' inline form (no modal). Bottom strip: copyright + version tag in ui-meta."

# === Decorative chrome (use intentionally — most pages do NOT need all of these) ===
chrome:
  grid-pattern:
    rule: "Hero only. Hairline-strong on canvas at 40px × 40px grid, 12% opacity."
    forbidden: "Never on body sections — it competes with text legibility."

  scanline-overlay:
    rule: "REMOVED from default. Reintroduce only in: (1) the game launcher page CRT moment, (2) an explicit 'system event' modal."
    why: "Generic scanlines on every hero are the single most identifiable AI-cyberpunk tell. The current globals.css `scanline-overlay` ships unused after redesign."

  glitch:
    rule: "Reserve for: page-load reveal of the wordmark (ONCE per session, gated by sessionStorage), error states (failed quiz answer, failed form submission), the threat-level=5 badge on the most severe guide."
    forbidden: "Continuous glitch on hero text. Glitch on every heading. Glitch on hover."

  particle-field:
    rule: "Hero background option, opacity ≤ 0.25, particles ≤ 12 on screen at once, 4–6px squares (NOT circles), drift speed < 0.4px/frame. Disabled when prefers-reduced-motion."
    forbidden: "Mesh-gradient AI blobs. Connected-line particle nets. Rainbow particles."

  glow:
    rule: "Glow only fires on (a) :focus-visible (a11y), (b) active threat indicator with threat-level ≥ 4, (c) the featured-card border on hover. Never on every accent text. Glow is *attention*, not *decoration*."

# === Absolute bans (project-specific, in addition to Impeccable's shared bans) ===
bans:
  - "Press Start 2P or any pixel-arcade font. Logo is JetBrains Mono 800 uppercase, period."
  - "Inter as body or display font. Replace with Geist."
  - "Pure #000 or pure #fff anywhere — use the tinted canvas/ink tokens."
  - "Cyan with chroma > 0.10 — #00F0FF (oklch ≈ 0.16 chroma) is too neon. The brand cyan is #65def0."
  - "Purple/blue gradients of any kind. There is no purple in this palette. There are no chromatic gradients anywhere — solid fills only."
  - "Scanline overlay on every page. See chrome.scanline-overlay above."
  - "Three-equal-card feature row. Use bento (1 large + 2 small, or 1 wide + 1 stacked-pair)."
  - "Hero-metric template ('10,000+ users protected!'). DiScammer doesn't have those numbers and faking them violates PRODUCT.md's anti-references."
  - "Modals for navigation, language switch, quiz progression. Inline progressive disclosure only."
  - "Side-stripe colored borders > 1px (the existing prose h2 with `border-left: 3px solid cyan` is grandfathered as the SINGLE allowed exception — the article body needs a clear h2 marker; nothing else gets this treatment)."
  - "Em dashes in body copy. Use commas, colons, semicolons, periods, or parentheses."
  - "AI marketing language: 'elevate', 'seamless', 'unleash', 'next-gen', 'delve', 'tapestry', 'in the world of'."
  - "Lucide / Feather icon sets exclusively. Default icon set: Phosphor (already-non-default, paired with the analyst-console feel)."
  - "Lorem ipsum. Russian filler. Generic 'John Doe' names. Round numbers like 99%, 50%, $100."
  - "External @import font tags blocking render. Fonts load via preconnect + font-display: swap; the body is readable in fallback before custom fonts arrive."
  - "h-screen / 100vh on hero. Use min-h-[100dvh] to avoid mobile-Safari layout jump."

# === The AI slop test (DiScammer-specific) ===
slop-test:
  first-order: "If a reviewer sees this site and says 'oh, that's the generic AI-cyberpunk anti-fraud site', fix the surface. Specifically: drop the pixel font, drop the every-section scanlines, drop the glow-on-every-accent."
  second-order: "If a reviewer sees this and says 'oh, cyberpunk but not Matrix — it's the SOC-console look', that's a hit on the second-order trap. Differentiate via the editorial register on article pages (long-form Geist body, sentence-case article h1, real photography for interviews), so the brand reads as 'analyst-station-AND-magazine', not 'analyst-station-template'."
  third-order: "Cyrillic typography must look intentional, not bolted on. Verify Geist + JetBrains Mono both have full Cyrillic glyph coverage and the same x-height in both scripts; if not, ship a Cyrillic-tuned alternative for the mono face."
---

## Overview

DiScammer's design system is a **single, committed aesthetic lane**: the briefing room of an anti-fraud analyst's workstation. The cyan-on-cool-dark canvas comes from the in-browser game ("Antifraud Hero"), but the website is intentionally *quieter* than the game — the game is the immersive simulation; the website is the reading-and-learning surface where the same operator drafts notes and reads briefings.

The system commits to **one chromatic accent** (cyan) that carries the brand voice, and **three semantic accents** (amber for caution, green for safety, red for confirmed threat) that derive their meaning from the fraud-investigation domain. Critically: no purple, no chromatic gradients, no neon, no pixel-arcade typography. Those are the AI-cyberpunk reflex; this brand is the more sober alternative.

**Two type families.** JetBrains Mono is the voice carrier (logo, section headings, badges, metadata, code, article h1). Geist is the reading face (body, lead paragraphs, descriptions). Both have strong Cyrillic coverage — non-negotiable.

**Cards are not the default solution.** Where the old Tilda site reached for a 3-column card row, this system reaches for a bento (one featured + two supporting), or a list with hairline dividers, or just generous spacing with strong typography. Cards earn their place by elevation, not by being the easy answer.

## Colors

### Canvas
Four-step dark canvas, each step a single OKLCH lightness increment apart. All four carry the same subtle blue tint (chroma 0.014–0.027 at hue 248–254) — never neutral gray, never warm. The tint IS the brand's coolness.

- `canvas` `#0b0f1a` — page background. Closer to "deep instrument-panel" than "navy".
- `canvas-soft` `#121828` — default card fill, sidebar fill, footer fill.
- `canvas-raised` `#1a2236` — hover state for cards, popover backgrounds.
- `canvas-input` `#1e2740` — form input fill, active button hover.

### Ink
Five-step text scale tinted toward the canvas. The lightest, `ink-strong` `#f3f5fa`, is reserved for display headlines only — body uses `ink` `#e7ecf5`, which is intentionally not screaming-white.

### Brand cyan
`cyan` `#65def0` (oklch 83% 0.094 217). **This is the single most important departure from the old palette.** The original `#00F0FF` carries chroma ≈ 0.16 — visibly neon, the saturation level of every AI-generated cyberpunk site. The new cyan reads as confident and selected, not synthetic. Two derivatives: `cyan-strong` for hover, `cyan-dim` for pressed / secondary.

### Semantic accents
Each tied to a fraud-investigation meaning. Do not interchange them for "variety":
- `amber` — warnings, "ARTICLE" badge (because articles are the analyst's editorial notes), threat-level 3.
- `green` — safe / verified / "NEWSLETTER" badge, threat-level 1-2.
- `red` — confirmed fraud, "SCAM GUIDE" badge, threat-level 5.

Each accent has a `*-veil` translucent companion at ~8-10% opacity for background tinting on active rows, hover surfaces, or selection states.

## Typography

### Two families. Commit.

**JetBrains Mono** carries identity. It's already familiar to developers (which is the right audience tone for the briefing-room aesthetic), has excellent Cyrillic glyphs, and its character is *technical without being arcade-pixel*. Used at weight 800 with -0.04em tracking, the wordmark "DISCAMMER" reads as confident and grounded — not as a retro-game cabinet.

**Geist** (the Vercel-released sans) is the reading face. It's chosen specifically because:
- It's not on the impeccable reflex-reject list (Inter is, DM Sans is, Outfit is).
- Its proportions are tight enough to live next to mono without clashing.
- Cyrillic is supported with consistent x-height.
- It reads gracefully at 16-18px body sizes on phones, which is where most users will be.

### Scale
Clamp-based fluid scale on display sizes; fixed sizes on body. The ratio between body-base (16px) and display-section min (24px) is ~1.5×, well above the "1.25× minimum step" rule.

### Cyrillic note
Both faces ship Cyrillic. Verify in build: the body should render in pure Geist Cyrillic, not in a fallback. JetBrains Mono Cyrillic has slightly different proportions than its Latin — for the section labels (`> ИНТЕРВЬЮ_LOG` in Russian), test for x-height parity at 24px.

## Components — selection notes

### Buttons
Three styles, all rectangular (radius ≤ 4px), all mono uppercase labels. No gradient fills, no glow on default state. The `button-primary` uses solid cyan fill with dark canvas text — high-contrast and decisive. Glow appears only on focus, where it doubles as the a11y focus indicator.

### Cards
Default card is hairline-bordered on `canvas-soft`. The hover state lifts to `canvas-raised` and shifts the border to `cyan-dim` — a low-key transition, not a 360-degree glow halo. The featured card (`card-bento-featured`) gets a `cyan-dim` border at rest and a faint inset glow on hover; it is rare and meaningful.

### Terminal block
The signature component — used for About Us, scam-script reproductions in guides, and inline code excerpts in articles. Three header dots in muted hairline gray (NOT macOS red/yellow/green — that's cute, not technical), cyan blinking cursor at the end of the last line, JetBrains Mono body. Maximum one or two per page, or the metaphor dilutes.

### Badges
Four colored badges (one per content type: interview/newsletter/article/guide). Each is `*-veil` background + matching accent text + matching translucent border. Tight `xs` radius. Always paired with a label, never color-only. The badge type is a `role` not a `decoration`.

### Carousel
Native CSS scroll-snap, not a JS slider library. Mobile-first: cards 75vw wide, half of the next card visible to communicate scrollability. Desktop: arrows appear on container hover. No dots; no autoplay; no infinite-loop wrap-around.

## Layout

### Hero
**Asymmetric.** Left column (60% width on desktop) holds the wordmark + tagline + 2-3 CTAs. Right column (40%) holds a `ui-meta` strip: live status indicator (small green pulsing dot + `MONITORING`), today's date in ISO format, last-content-updated timestamp. The asymmetry IS the design — the centered-stack hero is the templated AI default; this departure signals intention.

### Grid container
`min(72rem, calc(100vw - 2rem))` for marketing surfaces; `min(44rem, calc(100vw - 2rem))` for article reading surfaces. The narrower reading container keeps line length under 65ch even at 1080px viewport.

### Bento layouts
Where the old design used three equal cards, the new design uses bento: typically 2-up at desktop with one card wider than the other, stacking to single column at < 768px. The 3-pillar "About Us" row becomes a 2-column zigzag (image-left on items 1+3, image-right on item 2) instead of three icon-title-text cards.

## Motion

One easing curve: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quart). Four durations: instant (100ms, for cursor blink), quick (180ms, for color shifts), base (260ms, for card hover, button press), slow (420ms, for hero page-load reveal).

No spring physics. No bounce. No elastic. Animations exclusively on `transform` and `opacity` — never on `width`, `height`, `top`, `left`.

`prefers-reduced-motion`: kills particle field, kills page-load glitch, kills typewriter cycling. Keeps color transitions and the cursor blink (both are essential affordance, not vestibular triggers).

## Imagery

- **Interview cards**: real headshots when available, with `filter: saturate(0.85) contrast(1.05)` to unify visual tone across third-party photographs. Placeholder when missing: a `code-bg` square with the guest's initials in `display-card` mono cyan + their job-title in `ui-meta`.
- **Newsletter / Article cards**: editorial cover image OR a generated SVG hero (subtle pattern + the article's first-letter glyph in oversized mono). Never a stock-cybersecurity-padlock photo.
- **Scam Guide cards**: a Phosphor icon (specific to the scam type) on a `canvas-soft` square with a 1px hairline. Function over decoration.
- **In-article imagery**: real screenshots of scam messages with private fields blurred. Original Tilda site had none; this is a deliberate upgrade — the brand's authority comes from showing the actual patterns.

## Do's and Don'ts

### Do
- Reserve `cyan` for brand voice and active state. Treat it as a finite resource — when something is highlighted in cyan, that highlight should mean something.
- Use mono uppercase tracking for nav links, badges, button labels, dates, metadata. Anywhere the text is *signaling*, not *narrating*.
- Use Geist sentence-case for everything the reader is *reading*. Articles, guide bodies, lead paragraphs, descriptions, error messages.
- Keep article max-width at 65ch. Reading is the product.
- Treat the terminal block as a feature, not a wallpaper.

### Don't
- Don't introduce a pixel-arcade font, even for "fun" moments. The wordmark is JetBrains Mono 800.
- Don't add glow to every cyan element. Glow is attention; ubiquity is decoration.
- Don't add scanlines to every section. They are the AI-cyberpunk tell. Keep them out of the default chrome.
- Don't replace the cool-dark canvas with pure black or generic navy. The tint is identity.
- Don't ship three equal cards in a feature row. Use bento, list, or zigzag.
- Don't reach for a modal when an inline expand or a route change works. The journal filter is inline; the language switcher is a route, not an overlay; quiz progression is in-place state.

## Migration notes (for the redesign agents)

This DESIGN.md supersedes the existing `globals.css` token block. When implementing:

1. The current `--color-accent-cyan: #00F0FF` becomes `--color-cyan: #65def0`. This change cascades through every component that references the cyan token. Audit `box-glow-cyan`, `glow-cyan`, and the `.prose` styles — they all need the new value.
2. The current `.scanline-overlay` utility stays in CSS but is no longer applied to hero by default. It is reserved for game launcher + system-event modals.
3. The current `.cursor-blink` utility stays; it's used inside the terminal block.
4. Font loading: add Geist via `@font-face` (self-hosted in `backend/static/fonts/`) or via Google Fonts (preconnect + display=swap). JetBrains Mono is already loaded — keep it. Remove Press Start 2P loader; remove any Inter loader.
5. Add `font-variant-numeric: tabular-nums` to `ui-meta` and the date metadata.
6. Replace `border-radius` values >= 8px on cards with the new `radius.lg` (6px). Tighten button radii to `radius.md` (4px).

See `docs/references/` for inspiration files (Warp, VoltAgent, Vercel, Cursor, Raycast DESIGN.mds — read for *technique*, do not copy *appearance*).

---

## v2 "Field Office" additions (see docs/design/v2/00-DESIGN-SYSTEM-v2.md)

Tokens added to `globals.css` `@theme` (values stay on the locked palette):
- `--shadow-panel`, `--shadow-pop` — tinted-blue elevation (never pure black).

Utilities (two-register type rule, DS-v2 §3):
- `.t-data` (JetBrains Mono, tabular) · `.t-editorial` (Geist) — every text node is exactly one register.
- `.ds-grain` — opt-in ≤3% noise on `code-bg` terminal wells.

v2 UX-clarity moves shipped on the v1 stack: checker-led home hero (`MessageChecker`
island, pure client-side `analyze()`, detection→learning guide links, aria-live),
"Three ways in" clarity band, threat meters always `bars + LVL n/5 + WORD`
(`threat.lvl_1..5`), reusable "DO THIS TODAY" action module (`_action_module.html`),
breadcrumbs on inner pages. Brand stays locked (cyan `#65def0`, JBM + Geist, cool-dark).
