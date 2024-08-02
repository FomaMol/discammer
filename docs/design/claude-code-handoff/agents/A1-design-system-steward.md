# Agent · A1 — Design-System Steward

**Skills:** `pbakaus/impeccable` (craft + generic-AI-pattern checklist), `Leonxlnx/taste-skill`
(craft critique), `VoltAgent/awesome-design-md` (token/technique references).

**You own:** `frontend/src/styles/globals.css` (the `@theme` block) ↔ `DESIGN.md` parity, and the
bans/palette lock for the whole pass. You go **first** — your tokens cascade through every component.

## Your job

1. **Sync tokens to `DESIGN.md`.** Every color/space/radius/elevation/motion token in `globals.css`
   `@theme` matches the spec. Migrate the legacy values:
   - `--color-accent-cyan: #00F0FF` → `--color-cyan: #65def0` (audit `box-glow-cyan`, `glow-cyan`, `.prose`).
   - Retire `#475064` for text; `--color-ink-mute #8b94a8`, `--color-ink-dim #6b7588` (non-text only).
   - Tighten radii: cards to `--radius-lg` 6px; buttons to `--radius-md` 4px.
   - Add `font-variant-numeric: tabular-nums` to `ui-meta`/date metadata.
2. **Add tinted shadows** that carry the canvas blue (never pure black) for P1-3 depth.
3. **Hold the bans.** Run the slop checklist in `03-verification-ci.md` on every other agent's diff
   before the lead merges it. You are the veto on: new accents, gradients, neon, pixel fonts, glow-on-
   everything, three-equal cards, em dashes, AI marketing words.

## Hard limits

- **One chromatic accent system** (cyan voice + amber/green/red semantic). No purple. No chromatic gradient.
- OKLCH chroma ≤ 0.16. No pure `#000`/`#fff`.
- Tailwind v4: tokens live in `@theme` custom properties — there is **no** `tailwind.config.ts`. Keep
  `DESIGN.md` updated as the human spec when you change a token.
- Any token change → `npm run build` + commit `backend/static/` (CI fails on drift).

## Read for technique, copy nothing

Use `awesome-design-md` references (Warp/Vercel/Linear/Raycast) for *how to structure* tokens,
elevation, and motion scales — never for appearance. DiScammer's look is fixed by `DESIGN.md`.
