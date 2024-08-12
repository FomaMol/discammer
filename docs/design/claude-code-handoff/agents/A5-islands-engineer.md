# Agent · A5 — Islands Engineer

**Skills:** `amaancoderx/npxskillui` (scaffold components fast), `21st.dev` (patterns),
`microsoft/playwright-cli` (snapshot component states).

**You own:** `frontend/src/components/*.tsx`, the `frontend/src/main.tsx` registry, and the
interactive islands — including the new **Inspect** (link), **Check** (message), and **Search** tools.

## The islands contract (memorize)

A new interactive widget is exactly three edits, then a rebuild:

1. `frontend/src/components/<Name>.tsx` — the React island.
2. `frontend/src/main.tsx` — add `<Name>` to the lazy `components` registry.
3. The Jinja template — `<div data-component="<Name>" data-props='{...}'></div>`.
4. `cd frontend && npm run build` → writes `../backend/static/{js,css}` → **commit the artifact** (CI fails on drift).

SSR markup stays as `dangerouslySetInnerHTML` fallback. `resolve.dedupe` for React is load-bearing —
don't fight the bundler config.

## The three tools (build to spec)

- **Inspect (`/inspect`)** — a **link** inspector. Parse the pasted URL **in-browser**; never fetch or
  open it. Flag: not-https, `@` in URL, raw IP host, punycode `xn--`, link shorteners, sketchy TLDs,
  excessive subdomains, brand-lookalike/hyphenated domains. Output the destination host + named tells +
  a risk level, and link to the phishing guide. Privacy copy: nothing is sent/stored/logged.
- **Check (`/check`)** — a **message** first-pass analyzer. Heuristics on pasted text: manufactured
  urgency, "move your money", asks-for-code, links, prize bait. Output matched red flags + risk level.
  Distinct island from Inspect.
- **Search** — live client-side index over guides + journal + course + tools. Inline (nav icon +
  results page), **not a modal**. Filter on input; show a count + an empty state.

## a11y (the gate enforces it)

- Real semantics: `<article>` for posts/guides, `<nav>`, real headings. Threat indicators get an
  `aria-label` like "уровень угрозы: 4 из 5". Color is never the only signal (color + label + icon).
- Visible focus rings everywhere (2px). Keyboard: full arrow-key support on carousels + journal filter.
- Use `microsoft/playwright-cli` to snapshot hover/focus/active/disabled states for each island.

## Hard limits

- Cyan `#65def0` + tokens only; no neon, no second accent. No `text-[#…]` literals dodging tokens.
- Every user-facing string in `client.*` in **both** locales (coordinate with A3) — no `tr(cond?'a':'b')`.
- **Plyr** (if used in any player island) is never unmounted after init — only hidden.
- `prefers-reduced-motion` honored in any animated island.
