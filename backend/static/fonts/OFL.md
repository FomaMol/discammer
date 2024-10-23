# Bundled fonts — license & attribution

The `*.woff2` files in this directory are self-hosted subsets (latin / latin-ext /
cyrillic / cyrillic-ext) of two open-source typefaces, both licensed under the
**SIL Open Font License, Version 1.1** (https://scripts.sil.org/OFL). The OFL
requires that this notice accompany the redistributed font files.

## Geist  (`geist-*.woff2`)
- Copyright © 2023 Vercel, Inc.
- License: SIL Open Font License 1.1
- Source: https://github.com/vercel/geist-font  (also served via Google Fonts)
- Used as: `--font-sans` (reading / body register)

## JetBrains Mono  (`jetbrains-mono-*.woff2`)
- Copyright © 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono)
- License: SIL Open Font License 1.1
- Source: https://github.com/JetBrains/JetBrainsMono  (also served via Google Fonts)
- Used as: `--font-mono` / `--font-display` (signaling / voice register)

## How these were produced
Fetched from Google Fonts' `css2` endpoint as **variable** woff2 (Geist `wght 400..700`,
JetBrains Mono `wght 400..800`), keeping only the four subsets needed for EN/RU
(latin, latin-ext, cyrillic, cyrillic-ext) with the unicode-range blocks copied
verbatim. The `@font-face` declarations and the lang-aware preload links live in
`backend/templates/base.html`. See `DESIGN.md` (typography) and
`docs/design/v2/claude-code/02-tasks.md` (T0.2) for the rationale.
