# DiScammer — Design System v2 ("Field Office")

> Second iteration. v1 proved the concept (the analyst's briefing room) and killed the
> templated-uniformity slop. v2 turns that into a **rigorous, documented system** and pushes
> hard on one axis the brief never fully resolved: **UX clarity** — a first-time, non-technical,
> scared user must understand *what this is and what to do next* within five seconds, on a phone.
>
> v2 keeps the locked brand DNA (cyan `#65def0`, JetBrains Mono + Geist, cool-dark canvas, one
> accent system). Everything else is re-derived. This file is authoritative for the v2 build.

---

## 0. What changed from v1, in one breath

v1 was a beautiful brochure you *looked at*. v2 is a tool you *use*. The home page now leads with
the single most useful action (check a message), states the three modes in plain language, and
every content page ends with one concrete thing to do today. The visual language is the same family,
but now governed by explicit rules instead of taste applied case-by-case.

---

## 1. The UX audit (what wasn't clear, and the fix)

| # | Problem in v1 | Why it hurt the user | v2 fix |
|---|---|---|---|
| U0 | **Two competing heroes (A/B switcher)** | A real visitor never sees a "rhythm switcher"; and neither hero told them what to *do first*. | One decisive home. Hero leads with the **live message checker** as the primary action. The switcher stays only as a private design-review affordance, visually quarantined. |
| U1 | **No "what is this / how it works"** | A worried user from a Telegram link can't tell if this is a course, a blog, or a tool. | New **"Three ways in"** band right under the hero: Learn · Check · Practice. Plain verbs, one line each. |
| U2 | **Mono headlines everywhere** | Hierarchy muddy; reads as hacker-theme. | Formal **two-register type system** (§3). Mono = data/signal only. Geist = everything read. |
| U3 | **Threat level encoded by color + bars only** | Fails for color-blind users without reading aria; the *number* wasn't always visible. | Meter is now **always** `bars + "LVL n/5" + word (CRITICAL/HIGH/…)`. Color is the third signal, never the only one. |
| U4 | **Cards clickable but no affordance** | Whole-card `onClick` with no focus ring, no arrow, no keyboard path. | Every nav surface is a real `<a>`/`<button>` with visible `:focus-visible`, a trailing `→`, and a hover lift. |
| U5 | **No breadcrumb / "you are here" on inner pages** | Easy to get lost; back-path unclear. | Persistent breadcrumb on every inner page + active nav underline. |
| U6 | **Inspect/Check buried** | The most useful, most shareable thing on the site was one nav item. | Promoted to the hero and to the global nav as the primary CTA. The "pause, made into a tool." |
| U7 | **CTA inflation** | Most sections had 2 equal buttons → choice paralysis. | One **primary** action per view; everything else is a quiet text link. |
| U8 | **No empty / loading / success states shown** | Felt like a mockup, not a product. | Documented states for analyzer, inspector, search, and the report form (§7). |

---

## 2. Color — same palette, new *roles* and a texture layer

Tokens are unchanged in value (palette is locked, WCAG AA is enforced). v2 adds **role discipline**
and a **texture system** so flat darks stop reading as unfinished.

```
canvas        #0b0f1a   page
canvas-soft   #121828   panel / card fill
canvas-raised #1a2236   hover / popover / featured card
canvas-input  #1e2740   input + button-hover
code-bg       #0a0d16   terminal wells, inspector, hero console
hairline      #202a44   1px divider
hairline-str  #2b3759   emphasized divider, input border
ink           #e7ecf5   body + headline
ink-strong    #f3f5fa   display headline only
ink-soft      #aab2c4   secondary body
ink-mute      #8b94a8   metadata, captions  (AA ≥4.5:1)
ink-dim       #6b7588   NON-TEXT decoration only (≥3:1)
cyan          #65def0   brand voice + active state  (finite resource)
cyan-strong   #9eecf6   hover on cyan
cyan-dim      #3a8b9a   pressed / secondary cyan / decorative brackets
amber  #f4b965   caution · threat-3 · ARTICLE
green  #7ce896   safe · threat-1/2 · NEWSLETTER · verified
red    #e76670   confirmed fraud · threat-5 · SCAM GUIDE
```

**New: the texture layer (kills "flat sterile dark").**
- `--grain`: a fixed, `pointer-events:none`, ≤3% opacity SVG noise overlay on `code-bg` surfaces only.
- `--grid-40`: the 40×40 hairline grid, now allowed on **hero + game + CTA-band** (never behind body text).
- **Tinted shadows only.** Every shadow carries canvas blue, never pure black:
  `--shadow-panel: 0 1px 0 0 var(--hairline), 0 18px 40px -24px rgba(8,12,24,.7)`.

**Cyan budget.** Per view, cyan may appear on: the logo mark, the one primary CTA, the active nav
item, and live/active data. If a fifth cyan thing appears, demote it to ink.

---

## 3. Typography — the two-register system (the core v2 rule)

Every text node is assigned exactly one **register**. This is the single rule that fixes the
"mono-for-everything" slop and makes hierarchy legible. No element is left to taste.

### DATA register — JetBrains Mono. *Signaling, not narrating.*
Use for: logo wordmark, section eyebrows (`> THREAT_DATABASE`), badges, nav links, button labels,
dates / metadata / case-IDs, threat levels, breadcrumb path, terminal + inspector + analyzer body,
the page-h1 **only** on tool/brand surfaces (home, course, game, inspect, 404).
- weights: 600 (labels), 700 (data headings), 800 (wordmark + brand h1)
- tracking: `.14em` on tracked labels, `-0.04em` on 800 display
- `font-variant-numeric: tabular-nums` on every number
- uppercase only on labels and brand display, never on data sentences

### EDITORIAL register — Geist. *Everything the reader reads.*
Use for: article / guide / interview h1 (sentence case), all body, leads, card titles in journal,
descriptions, list-row titles, error and helper text.
- weights: 400 (body), 500 (card titles, mid-emphasis — **new in v2**), 600 (editorial headlines)
- `text-wrap: balance` on headings, `pretty` on body, measure capped at 65ch (62ch lead)

### The scale (fluid display, fixed body)
```
brand-hero    mono 800  clamp(2.5rem, 1.4rem+5vw, 4.5rem)   -0.045em  upper   (home/game h1)
brand-h1      mono 800  clamp(2rem, 1.4rem+2.6vw, 3.25rem)  -0.04em   upper   (tool pages)
editorial-h1  geist 600 clamp(1.9rem, 1.3rem+2.4vw, 2.9rem) -0.025em  sentence(article/guide)
section-eye   mono 600  11px  .16em  upper      (eyebrows; `>` is literal, aria-hidden)
section-h2-d  mono 700  clamp(1.5rem,1.1rem+2vw,2.25rem) -0.02em upper   (data sections)
section-h2-e  geist 600 clamp(1.5rem,1.1rem+1.6vw,2.1rem) -0.02em sentence (editorial sections)
lead          geist 400 1.125rem  1.6  62ch
body          geist 400 1rem      1.7  65ch
card-title    geist 500 1.0625rem 1.3
data-cell     mono 700  clamp(1.25rem,2.4vw,1.75rem) tabular
label         mono 600  0.6875rem .14em upper
meta          mono 500  0.75rem   .02em tabular
```

---

## 4. Spacing & section rhythm — codified "temperature"

The P0 slop was every section wearing the same uniform. v2 makes section type an explicit choice
from a fixed vocabulary, and the page must alternate temperature (loud → quiet → loud).

Section types (each has fixed padding + alignment + register):
- **HEADER** — hero. `section-y-hero` (clamp 5–10rem). Asymmetric grid, grid-40 + grain.
- **FEATURE** — one focal bento (1 large + supporting). `section-y-default`. Loud.
- **QUIET-LIST** — dated hairline-divided list, lots of air, no chrome. `canvas-soft`. Quiet.
- **DATA-WALL** — threat DB / KPI cells, divided, mono, dense. Loud, technical.
- **CTA-BAND** — full-bleed band, one action. grid-40. Loud close.

Spacing tokens: 4 8 12 16 24 32 48 72 96 128. Container `min(72rem, 100vw-2rem)`; reading
`min(44rem, 100vw-2rem)`. Radius: 2 / 3 / 4 / 6 / pill. Cards 6px; buttons 4px; badges 2px.

---

## 5. Component inventory (role-differentiated — cards earn their place)

1. **case-file card** — featured threat/interview. `canvas-raised`, accent-tinted border, oversized
   ghost index numeral, badge, meter. The only card that may glow (on hover).
2. **list-row** — dated journal/search row. hairline divider, badge + title + meta, hover = `cyan-veil`
   + 8px indent. No box.
3. **data-cell** — KPI / case-file metadata. mono number + label, vertical hairline dividers, no fill.
4. **terminal-well** — `code-bg` + 3 muted dots + filename + blinking cyan cursor. Max 1–2 per page.
   Used by: home console, scam-script transcript, inspector, analyzer, 404.
5. **threat-meter** — 5 slats + `LVL n/5` + word. Fills on scroll-in (staggered). Color is signal #3.
6. **badge** — veil bg + accent text + accent border, label always present (never color-only).
7. **breadcrumb** — mono path, `cyan-dim` segments, `/` in `ink-dim`, last segment `ink`.
8. **CTA-band** — gradient `canvas-raised→soft`, `cyan-dim` border, one primary button.
9. **action-module ("DO THIS TODAY")** — *new, reusable.* Every content page ends with one. This is
   PRODUCT.md Principle #5 ("the pause is the feature") turned into a component.
10. **status-pill** — live dot + state word (MONITORING / SIMULATION READY / VERIFIED).

Buttons: `primary` (solid cyan, dark text, one per view), `secondary` (hairline, ghost),
`text` (quiet link with `→`). All mono-uppercase labels, radius 4px, focus = cyan glow ring.

---

## 6. Motion — three tiers, all reduced-motion mapped

| Tier | What | Reduced-motion |
|---|---|---|
| Ambient | hero/game canvas (grid + ≤18 drifting squares + slow scan), cursor blink, live dot | canvas → static grid; dot → static; blink kept (affordance) |
| Entrance | staggered `[data-reveal]` (opacity+translateY, 70ms stagger), meter fill, progress bar, wordmark glitch once/session | all snap to final state instantly |
| Feedback | hover lift/border, button press, focus ring, analyzer/inspector live re-render | color transitions kept; transforms removed |

One curve: `cubic-bezier(.16,1,.3,1)`. Durations 100/180/260/420ms. GPU-only (`transform`/`opacity`).
Never animate width/height/top/left (progress bar width is the single grandfathered exception).

---

## 7. UX states (documented, not improvised)

- **Analyzer / Inspector**: `empty` ("awaiting input…") → `live` (tells stream in with LVL pill) →
  `clean` (green "no obvious tells, not a guarantee"). Privacy line always visible.
- **Search**: `idle` (N indexed) → `results` (count + rows) → `empty` (binoculars + suggestion).
- **Report form**: `idle` → `sent` (inline green confirmation, no modal).
- **Course modules**: `done` / `in-progress` / `locked` — pill + icon + color, never color alone.
- **Focus**: every interactive element shows a 2px cyan focus ring on `:focus-visible`. Skip-link first.

---

## 8. Accessibility (carry forward, do not regress)

WCAG 2.1 AA enforced. Body ≥4.5:1, large/non-text ≥3:1. Real semantic elements (`<a> <button>
<nav> <article>`, real headings). Threat level has `aria-label="threat level 4 of 5"`. Color is
never the only signal. Reduced-motion honored everywhere. Mobile-first reading: 16–17px body,
<65ch measure, layout breathes ~10–15% wider for Cyrillic. RU/EN authored parity.

---

## 9. Build order (what the v2 file does)

1. Quarantine the design-review switcher; ship one decisive home.
2. Hero → lead with the live checker + status pill + plain value prop.
3. "Three ways in" clarity band (Learn / Check / Practice).
4. Apply the two-register type rule to every node.
5. Threat-meter: add the word + number everywhere.
6. Add breadcrumbs + active nav + visible focus.
7. Add the reusable "DO THIS TODAY" action-module to every content page.
8. Texture layer on the right surfaces; tinted shadows.
9. Real `<a>/<button>` semantics + `→` affordance on every nav surface.
10. Verify states, RM, AA, mobile.
```
