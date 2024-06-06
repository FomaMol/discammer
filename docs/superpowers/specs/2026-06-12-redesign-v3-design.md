# Redesign v3 — polish pass design spec

Date: 2026-06-12
Status: approved for implementation (autonomous session; user requested plan + redesign + full code review with fixes)

## Context

The site already completed a five-iteration redesign that implemented DESIGN.md (analyst-briefing-room aesthetic: tuned cyan `#65def0`, JetBrains Mono + Geist, terminal chrome with meaning). A fresh audit was run on 2026-06-12 against the standards of the impeccable, taste-skill and redesign-skill design systems, with full-page Playwright screenshots of every page (RU + EN, desktop + mobile) stored in `/tmp/dcm-audit/`.

Verdict: the foundation is sound and on-brand. No re-theming is warranted; v3 is a surgical polish pass plus a full code-review fix round. Re-theming or adding heavy chrome (Three.js/WebGPU hero, framer-motion) was considered and rejected: `HeroShader.tsx` already ships a purpose-built raw-WebGL2 shader with reduced-motion support and documents why three.js was avoided (~700 KB for one effect). DESIGN.md bans decorative chrome that does not carry meaning.

## Findings (design audit)

### D1. Doubled `> >` prefix on section headings and terminal lines — fix

Locale strings carry a literal `> ` prefix (DESIGN.md: "The `>` is literal narrative"), but several consumers prepend their own styled `>` on top:

Verified rendered doubles on home (`playwright eval` over hydrated DOM, both locales):
`> > МИССИЯ`, `> > ОСНОВНЫЕ_ЗАДАЧИ` (home.html h2 spans + locale strings), `> > ЖУРНАЛ_ИНТЕРВЬЮ`, `> > ЛЕНТА_РАССЫЛОК`, `> > БАЗА_СТАТЬЕЙ` (ContentCarousel.tsx:132 span + locale strings). `> БАЗА_УГРОЗ` (ScamTypesGrid + plain locale string `threat_database_title`) renders correctly and is the reference pattern. `HeroTerminal` additionally hardcodes `'> > > AWAITING USER COMMAND _'` / RU equivalent.

Canonical rule going forward, copied from the one surface that gets it right (ScamTypesGrid): **section-heading locale strings are plain text; the consumer renders the single styled muted arrow (`<span class="text-[#475064]" aria-hidden>&gt;&nbsp;</span>`)**. Terminal body lines keep the arrow inside the string because there is no consumer-side arrow there.

Fix list: strip the `> ` prefix from `home.section_mission_title`, `home.section_directives_title`, `home.interview_log_title`, `home.newsletter_feed_title`, `home.article_database_title` in both `en.json` and `ru.json` (this also cleans the `aria-label`s that reuse these keys); change HeroTerminal's awaiting line to a single `>`. Bonus: screen readers stop announcing "greater-than" before section names.

### D2. Skip-link is hardcoded English — localize

`base.html` ships `Skip to content` even on `/ru/` pages. Add `a11y.skip_to_content` to both locale files and use `t()`.

### D3. No current-page indication in navigation — add

DESIGN.md `nav-link` spec defines `activeBorderBottom: 2px solid cyan; activeColor: ink-strong`, but neither desktop nav nor MobileMenu marks the active section. Add `aria-current="page"` + the active style for the matching top-level section (course / journal / game), derived from the request path in `base.html` and from `window.location.pathname` in `MobileMenu`.

### D4. Video player has no error state — add

Post pages embed Plyr pointing at `/media/videos/...` (served by nginx on prod only). When the MP4 404s (local dev, future missing files), the player sits as a dead black box with `00:00 / 00:00`. Add an error handler in `VideoPlayer.tsx`: on media error, replace the player with a quiet terminal-styled notice (`// запись недоступна` / `// recording offline`) so the page never shows a broken control. This is also the redesign-skill "no missing error states" rule.

### D5. Double scroll container from `overflow-x: hidden` — fix

`globals.css` sets `overflow-x: hidden; max-width: 100vw` on both `html` and `body`, which promotes `body` to its own scroll container (breaks `position: sticky` in edge cases, confuses tooling, adds a phantom scroll box). Replace with `overflow-x: clip` (with `hidden` as the cascade fallback for older browsers) and drop the redundant `max-width`.

### D6. Display headings can orphan — minor

Add `text-wrap: balance` to display headings (hero h1 is single-word so unaffected; section h2s and article h1s benefit, especially in Russian where titles run 10–15% longer).

### Checked and intentionally NOT changed

- Newsletter cards are text-only wire-service cards by design; interview/article cards already have the DESIGN.md fallback treatment (initials / first-letter glyph). No bare-cover bug exists.
- `/media/*` 404s locally: media is served by nginx from `/opt/discammer/media` on prod (commit 0ead10e). Not a code bug; D4 covers the UX when a file is genuinely missing.
- Blank mid-page screenshots seen in the preview harness were a tooling artifact; Playwright full-page renders confirm every section paints correctly.
- Hero, journal broadsheet, course operative map, game launcher, about, 404 pages: all pass the slop tests (first- and second-order) and PRODUCT.md anti-references.
- No purple, no gradients, no pixel font, no neon `#00F0FF` anywhere; token system matches DESIGN.md.

## Code review round (parallel to this spec)

Four review agents (backend Python, frontend React/TS, templates/i18n/a11y, infra/CI) are auditing the codebase. Their verified findings are fixed in the same v3 round under the implementation plan, prioritized: security > correctness > a11y > performance > hygiene.

## Out of scope

- New pages, new content, course changes.
- WebGPU/Three.js hero (rejected, see Context).
- Framework or styling migrations (Tailwind v4 + islands stay).
- Visual re-theming of any existing page.
