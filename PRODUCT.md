# Product

## Register

brand

## Users

Russian- and English-speaking adults (16–60) who feel exposed to modern scams — phishing texts, fake "verification" calls, romance fraud, fake online stores, get-rich-quick pitches — and want to recognize them before losing money. They arrive from a friend's link, a Telegram share, or a search for "как не попасться на мошенников". Most are not technical. Some have already been scammed once and never want it again. They read on a phone in spare minutes; a smaller cohort works through the course on a laptop.

The user's job: build a working detector in their own head. Not "complete a course" — *develop the reflex to pause and check.*

## Product Purpose

DiScammer is a free, multilingual education platform that teaches the cognitive moves of an anti-fraud analyst: how scams are structured, what red flags fire, what to do in the first 60 seconds when something feels off. The surface has three modes — journal (interviews, newsletters, articles), threat database (10+ scam-type guides), and a structured course (modules → lessons → quizzes → exam → certificate) — plus a serious in-browser game ("Antifraud Hero") that simulates an analyst's workstation.

Success is the moment a user receives a sketchy message and *hesitates correctly*. The site exists to install that pause.

## Brand Personality

Three physical-object words: **vigilant, plain-spoken, technically grounded.**

- **Vigilant**, not paranoid: the voice of someone who has seen the patterns and now points them out calmly. Not yelling.
- **Plain-spoken**, not academic: anti-fraud explained like a senior colleague explains it to a junior — direct, with examples, no condescension. Russian voice especially: educated everyday speech, not officialese.
- **Technically grounded**, not LARPing as hackers: real fraud taxonomy, real numbers, real attack flows. Cyberpunk visuals are earned by the actual subject matter, not bolted on for vibes.

Emotional arc: arrive curious or worried → feel "this person knows what they're talking about" → leave with one specific thing they'll do differently.

## Anti-references

- **Generic "hacker" sites with Matrix-green-on-black, glitch text, and Press Start 2P everywhere.** Costume cyberpunk reads as fake; DiScammer's authority comes from accuracy, not aesthetics that scream "computer". A pixel font on a marketing surface signals AI-generated.
- **Tilda / Wix template stacks.** The previous DiScammer site was a Tilda build — red hero, identical 3-column card rows, generic line-art icons. Every section's solution there is the template's solution. Reject the block-builder feel.
- **Web3 / NFT landing pages** — neon purple/blue gradients, oversaturated cyan, hero-metric template ("$50M+ saved from fraud!"), particle-mesh backgrounds. This is the second-order trap: cyberpunk-without-Matrix often lands here.
- **Corporate cybersecurity vendors** (Kaspersky, Norton, McAfee landing pages): polished, blue, stock-photo-of-padlock, completely impersonal. DiScammer is not a B2B SOC platform. It is a teacher.
- **AI-assistant landing pages** (ChatGPT-clones with purple accents, animated typewriter hero, "Elevate your understanding of fraud"). Sterile, generic, voice-less. Forbidden words: *delve, seamless, elevate, unleash, next-gen, in the world of.*
- **Children's-educational tone.** Anti-fraud sites often condescend ("Don't share your password, silly!"). DiScammer respects the user's intelligence. Worst-case, the user is scared and ashamed — talk to them as an equal.
- **Modal-as-first-thought UX.** Quizzes, lesson navigation, language switching — all prefer inline progressive disclosure over popups.

## Design Principles

1. **Show the work, not the costume.** Cyberpunk surface elements (mono type, terminal blocks, IP-style metadata) appear only where they carry meaning — a threat-level indicator, a scam-attempt log, a quiz timing display. Decorative-only chrome (random scanlines on every section, glitch on every heading) gets cut.
2. **Authority by specificity.** "Phishing" is a category; "the SMS that pretends to be from your bank's verification system and asks you to confirm a transfer you didn't make" is a scam pattern. Always reach for the second register. Numbers, dates, real attack vectors over abstract warnings.
3. **Game is the visual home base, web is the field office.** The game ("Antifraud Hero") owns the deepest cyberpunk immersion; the website is the analyst's *briefing room* — same world, lower contrast, more reading-friendly. Don't out-game the game.
4. **Russian-first, English-equal.** Both languages get authored copy, not Google-translated strings. Layout breathes for Cyrillic (~10–15% more text width on average); typography pair must render both at the same visual weight.
5. **The pause is the feature.** Every page should give the reader one concrete thing they can do *today*. No empty "stay safe online" platitudes. The CTA after a guide is "now check your bank app's transaction-confirmation flow", not "learn more".

## Accessibility & Inclusion

- **WCAG 2.1 AA minimum.** Body copy hits AA contrast on the dark canvas (≥ 4.5:1); large display type and brand cyan hit AA Large (≥ 3:1) — verify the accent cyan against the canvas with a contrast checker and adjust the cyan's chroma if it falls short rather than darkening the canvas.
- **Keyboard navigable everywhere.** Visible focus rings (not just `outline: none` cleared without replacement). Skip-to-content link in `base.html`. The journal filter and carousels need full arrow-key support.
- **Reduced-motion respected.** `prefers-reduced-motion` already kills scanlines and glitch; extend to typewriter, particle background, and any future scroll-triggered choreography. Hover color transitions stay — they aren't vestibular triggers.
- **Screen reader semantics.** Use `<article>` for posts and guides, `<nav>` for navigation, real headings (no styled divs). Threat-level indicators need an aria-label that reads as "уровень угрозы: 4 из 5", not just visual bars.
- **Color is never the only signal.** Threat badges combine color + label + icon. A green/red color-blind user must be able to distinguish "safe" from "danger" without the hue.
- **Mobile-first reading.** Most users are on phones — body type at 16–17px, line length under 65ch on phones too. No horizontal scroll outside intentional carousels.
- **No autoplay sound, no autoplay video** anywhere on the marketing surface.
