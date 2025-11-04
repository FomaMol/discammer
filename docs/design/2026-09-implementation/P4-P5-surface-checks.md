# P4/P5 surface checks — 2026-09-10

Implementation evidence from the local preview at `http://127.0.0.1:8898`; this is not a production verification.

## P4

- Journal retains its server-rendered reading links until the API enhancement succeeds. Loading, empty and error are separate; errors offer a retry. Filter buttons support arrows, Home and End. Removed the reading-minute guess based only on the title and content category.
- Guides have a server-rendered contents list visible on mobile and with JavaScript disabled. Removed decorative document line numbers.
- Course/module retain server-rendered navigation while requests fail. An empty course response keeps the SSR list. Module requests check HTTP status. Lesson titles wrap and exercise text/controls are larger.
- Search starts with SSR results, separates loading/error/empty and cancels superseded requests. Editing clears stale-query results while preserving the new input. The native GET form still works.
- Authored content, local progress, import/export/sync behavior, message/URL privacy, and portfolio attribution are unchanged.

Checks: TypeScript passed; frontend unit suite 199 passed; selected backend smoke/search/provenance 42 passed. `e2e/surface-foundations.spec.ts` passed 7/7 in Chromium on the current local build: RU/EN journal failure/retry, search error, mobile JS-off guide contents/module/lesson navigation, and empty course response.

## P5

- Plyr controls now use runtime brand colors, including the previously hardcoded overlaid play control; reduced-motion removes its hover scale.
- Local completion record uses theme roles on screen and an isolated neutral print stylesheet. Cyrillic names wrap. The record remains explicitly local and unverified.
- Offline page, manifest, favicon, logomark, and editable guide-cover SVGs use the approved default soft-red palette. Added a separate maskable PWA icon with the mark inside the mask safe zone.
- Regenerated 66 localized content OG PNGs plus the default OG PNG through `scripts/og_generate.py`. The generator embeds checked-in Latin/Cyrillic fonts, localizes Russian type/threat labels, fits the complete title without ellipsis, and regenerates the default from its SVG source. Removed monitoring/live-operation labels from the OG sources.
- A second generator run reproduced all 67 PNGs byte-for-byte (SHA-256 comparison). Content-card payload totals 8,527,492 bytes. This figure is asset size, not a performance claim.

Checks: backend OG/SEO/service-worker suite 61 passed; after the maskable icon change SEO 50 passed. TypeScript passed. Visually reviewed the default OG, the longest Russian interview title in the current seeded catalogue, and a Russian guide card.

Completion-record evidence in `evidence/certificate-cyrillic-*` uses synthetic completed progress and the test name “Александр Константинович Константинопольский”; it is a layout test, not an actual completion claim. The produced PDF has one page and retains the complete Cyrillic name and local-record limitation. A PDF render exposed dark outer page margins; the print stylesheet now explicitly sets the HTML canvas white. Final rebuilt print verification is recorded below when complete.

## Final rebuilt verification

The rebuilt preview on 8898 was checked again after the print-canvas correction: the PDF is one page, the actual rendered PDF page has white outer margins, the complete synthetic Cyrillic name wraps cleanly, navigation is absent, and the local/unverified record wording is intact. Updated `certificate-cyrillic.pdf`, screen/print screenshots, and `certificate-cyrillic-pdf-page.png` contain the final evidence.

Independent hydration review identified three regressions from deferred enhancement; the root implementation corrected each. Browser checks against the rebuilt preview confirm: an untouched tab follows another tab's stored theme without opening the appearance control; an SSR mobile menu opened during a delayed chunk remains open after enhancement; a failed appearance chunk removes its inert trigger; the first appearance click during a delayed import opens choices and focuses the selected radio; a search edited before its chunk arrives preserves its complete Cyrillic query and input focus.
