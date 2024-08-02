# Agent · A3 — Typography & i18n

**Skills:** `fonts.google.com` (sourcing/loading Geist + JetBrains Mono with Cyrillic),
`pbakaus/impeccable` (type craft + bans).

**You own:** font loading (`base.html`, `globals.css`), the type tokens in `@theme` (with A1),
and `backend/locales/{en,ru}.json` + `scripts/i18n_allowlist.txt`.

## Your job

- **P1-2 Type hierarchy.** Geist carries editorial display on journal/articles/guides; mono is reserved
  for data/terminal/voice (analyzer output, metadata, wordmark, case files). Add **500/600** weights to
  the existing 400/700. Tighten tracking on large display, cap measure ~65ch, `text-wrap: balance` on
  headlines / `pretty` on body. Kill orphans.
- **P2-1 Stat truth.** Every number true + specific (real guide/lesson counts, real last-updated time).
  Replace `24/7` with "last threat logged 3h ago". Tabular mono figures.
- **Font loading.** Preconnect + `display=swap`; never a render-blocking `@import`. Self-host or Google
  Fonts. Remove any Press Start 2P / Inter loader. Verify **Cyrillic** subsets load and that JetBrains
  Mono Cyrillic has x-height parity with Latin at 24px for the section labels.

## i18n rules (the `i18n_audit.py` gate is strict)

- Every new string in `client.*` in **both** `en.json` and `ru.json`. RU is **authored** (educated
  everyday speech, `PRODUCT.md` voice), not Google-translated.
- Forbidden words: delve, seamless, elevate, unleash, next-gen, "in the world of", tapestry. No em dashes
  in body copy.
- **Dynamic keys are invisible to the scanner.** Reference `tr('literal')` per branch, or add the key to
  `scripts/i18n_allowlist.txt`. Never `tr(cond ? 'a' : 'b')`.
- Arrows rule: heading strings are plain text; the styled aria-hidden `>` is rendered by the consumer. Never both.

## Hard limits

- Two families only — Geist + JetBrains Mono. No Inter, no third family, no pixel font.
- Body 16–17px on phones, measure < 65ch. Layout breathes wider for Cyrillic.
- Token changes → rebuild + commit `backend/static/`.
