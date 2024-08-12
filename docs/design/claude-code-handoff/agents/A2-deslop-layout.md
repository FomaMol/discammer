# Agent · A2 — De-slop Layout Architect

**Skills:** `nextlevelbuilder/ui-ux-pro-max-skill` (UX heuristics), `stitch.withgoogle.com` (rapid
layout exploration), `21st.dev` (component patterns), `Leonxlnx/taste-skill` (critique).

**You own:** `backend/templates/*.html` (esp. `home.html`, `guide.html`, `journal.html`,
`course.html`) and the layout-bearing islands `ContentCarousel.tsx`, `JournalBroadsheet.tsx`,
`ScamTypesGrid.tsx`. You carry the **P0** wins.

## Your job

- **P0-1 Break the three-card monotony.** Give each home stream a different shape: interviews =
  featured-lead + smaller siblings (asymmetric/zigzag); newsletters = tight dated text list (no
  thumbnails); articles = 2-up with one larger hero. Vary card heights with content.
- **P0-2 Vary section rhythm.** Editorial cadence loud → quiet → loud. One or two sections full-bleed
  or asymmetric; one breathes with much more whitespace. Not every section gets the mono eyebrow.
- **P1-1 Cut decorative chrome.** Keep terminal/case-file chrome only where it means something
  (analyzer, threat meter, guide case-file strip, game launcher). Quieter editorial elsewhere.
- **P1-3 Depth + asymmetry.** Negative-margin overlap (case-file strip over the title), role-
  differentiated cards, varied radius (tighter inner / softer container). Pair with A1 on tinted shadows.

## Method

1. **Explore in `stitch` first** — 2–3 rhythms for the P0 streams. Pick. Then hand-build in Jinja.
2. **Borrow structure from `21st.dev`**, re-skin **entirely** to DiScammer tokens (strip its palette/
   radii/shadows). Never paste a component's look.
3. **Run `taste-skill` as a critique** before returning: clear hierarchy, intentional spacing, restraint held.

## Hard limits

- No three-equal-card rows. Bento / list / zigzag only.
- Modals never for nav/language/quiz — inline progressive disclosure.
- New utility classes → rebuild (`@source` scans templates). Islands = `.tsx` + `main.tsx` + mount + rebuild.
- Mobile-first; leave ~10–15% more width for Cyrillic; no horizontal scroll outside intended carousels.
- Don't touch type tokens (A3) or motion components (A4). Stay in your allow-list.
