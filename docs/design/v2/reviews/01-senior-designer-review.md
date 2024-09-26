# Design review — DiScammer v2 ("Field Office")

**Reviewer role:** Senior Product Designer, large consumer-tech company (the kind of review you'd
get in a design crit before a launch sign-off).
**Artifact:** `DiScammer v2.dc.html` — second iteration. Compared against v1 and the locked brand
(DESIGN.md / PRODUCT.md / deslop-handoff.md).
**Verdict:** **Ship-worthy with minor follow-ups.** The concept is genuinely differentiated and the
v2 pass fixed the thing that mattered most: a stranger now understands the product and can act in
five seconds. Below is the honest crit — what's strong, what I'd push on, and what I'd block on.

---

## What's strong (keep, protect)

1. **A real point of view.** The "anti-fraud analyst's field office" is a defensible concept, not a
   skin. Most security-education sites are either Norton-blue corporate or Matrix-green costume. This
   is neither. That's rare and it's the moat. Do not let anyone "modernize" it toward a generic SaaS
   gradient.
2. **The tool leads.** Moving the live message-checker into the hero is the single best decision in
   v2. The product's core promise ("install the pause") is now demonstrable in the first viewport,
   for free, with zero signup. That's textbook "show, don't tell." It also makes the page shareable —
   someone forwards a scam, a friend pastes it, the value is instant.
3. **The two-register type system.** Splitting JetBrains Mono (data/signal) from Geist (reading) is
   the correct structural fix for the "mono-everything" flatness. It's a *rule*, not a vibe, which is
   what makes it scalable across a 10-screen product.
4. **Restraint with the accent.** Treating cyan as a finite budget (logo, one CTA, active state, live
   data) is disciplined. The semantic amber/green/red tied to fraud meaning — not decoration — is the
   kind of thing that reads as "designed by someone who understood the domain."
5. **Honest data.** No "$50M saved" hero metric. The numbers (10 guides, 23 lessons, "3h since last
   log") are specific and falsifiable. Authority by specificity is the right brand move and the right
   ethics move for an anti-fraud product.

## What I'd push on (should-fix, not blocking)

1. **Section rhythm is better but not yet musical.** v2 alternates loud/quiet, but the FEATURE
   sections (interview bento, article 2-up) still share a similar silhouette. I'd let *one* of them
   break the container — a full-bleed quote or a single oversized case-file — so the scroll has a true
   peak, not just even hills.
2. **The "Three ways in" band is doing heavy lifting; give it more height.** It's the comprehension
   moment for a scared first-timer. Right now it's compact. I'd let it breathe 1.3× and consider a
   one-line "which one is right for me?" helper under each verb.
3. **Threat meter legibility on small cards.** The 5-slat meter + "CRITICAL · 5/5" is good, but at
   320px the bars compress. Confirm the *word* never truncates before the bars do — the word is the
   accessible signal, the bars are decoration.
4. **CTA after the checker.** When a result comes back "HIGH RISK," the next action should be a
   button, not a sentence. "This looks like a [phishing] pattern → read the 60-second response" closes
   the loop from detection to learning. Right now the loop is implied, not wired.
5. **Empty/clean state copy.** "no obvious tells, but a clean-looking link is not a guarantee" is
   honest and good — but a worried user reads "clean" as "safe." Soften toward "I didn't catch
   anything, which is not the same as safe." Tone matters most exactly here.

## What I'd block on (must-fix before "done")

1. **The A/B switcher must never reach production.** It's correctly quarantined as a review tool in
   this artifact, but the handoff must make explicit that it is *not* a feature. A real user seeing a
   "RHYTHM: A/B" control would be confused and it would leak the seams.
2. **Keyboard path through the checker.** The hero textarea is reachable, but verify the *result*
   region is announced (aria-live) so a screen-reader user hears the tells appear. For an
   accessibility-first anti-fraud tool, this is non-negotiable, not polish.
3. **RU parity of every new v2 string.** "Three ways in," the checker label, the new helper lines —
   all must ship authored Russian, not translated. The brand's whole credibility rests on the Russian
   reading as a native senior colleague, not Google Translate.

## Craft notes (the small stuff that separates good from done)

- Optical alignment on the `>` eyebrows and the icon+label pairs is mostly right; spot-check the
  trailing `→` baseline against its label.
- Tinted shadows are correctly blue-cool; make sure none slipped to pure black on the featured cards.
- Motion is tasteful and reduced-motion-safe. The wordmark glitch-once-per-session is a nice,
  confident touch that doesn't overstay.
- Don't add a sixth section to home. It's the right length. Resist the urge to fill.

## Bottom line

This reads as a product designed by someone who understood both the user's fear and the domain's
mechanics, then made deliberate restraint choices. The v2 pass turned a beautiful brochure into a
usable tool without losing the concept. Fix the three blockers, wire the detection→learning loop, and
this is a portfolio-grade, launch-grade piece.

— *Senior Product Designer review, pre-launch crit*
