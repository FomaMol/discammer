# docs/design — redesign source material

Unpacked from the **Claude Design** export *"Redesign Discammer сайта.zip"* (ingested 2026-06-20).
The zip is deleted; everything worth keeping lives here.

## What's here

| Path | What it is | Status |
|---|---|---|
| `deslop-handoff.md` | **The authoritative audit.** P0–P3 slop tells grounded in the live build, hard constraints, verify steps, suggested order. | Source of truth |
| `claude-code-handoff/` | Operationalizes the audit into a multi-agent plan (LEAD + A1–A6), a skill map, file-scoped P0–P3 tasks, and the CI gate. | Source of truth |
| `redesign-canvas/` | The Claude Design canvas artifacts — visual targets to react to. `*.dc.html` open in a browser (they pull `support.js`, the canvas runtime). `thumbnail.png` / `check.png` are previews; `audit-shots/` are the screenshots fed into the design session. | Reference only |
| **`v2/`** | **The v2 "Field Office" package** (ingested 2026-06-20, second export). The UX-clarity rebuild on the same locked brand. `00-DESIGN-SYSTEM-v2.md` (authoritative DS + UX audit), `DiScammer-v2.dc.html` (reference canvas + `support.js`), `claude-code/` (multi-agent handoff: A0 orchestrator + A1–A6, P0–P3 tasks, CI gate), `reviews/` (senior-designer + university-portfolio crits), `PACKAGE-NOTES.md` (the design-package CLAUDE.md note). | **Next plan** |
| `_ignored-cadence-ds/` | A generic "Cadence" planner design system that Claude Design auto-attached. **Explicitly out of scope** — see below. | **IGNORED** |

## v1 vs v2

**v1** (`redesign-canvas/` + `claude-code-handoff/` + `deslop-handoff.md`) is **shipped to prod** — the
editorial-cadence home, the redesigned nav, and all 8 pages. **v2** (`v2/`) is the **next iteration**:
"turn the brochure you look at into the tool you use" — lead the home with the live message checker,
add a "Three ways in" (Learn · Check · Practice) clarity band, enforce a two-register type rule
(JetBrains Mono = data/signal, Geist = everything read), make threat meters always show bars + `LVL n/5`
+ word, retire the A/B home, add breadcrumbs + visible focus, and a reusable "DO THIS TODAY" action
module. Same locked brand (cyan `#65def0`, JBM + Geist, cool-dark, one accent). The v2 build plan is
`v2/claude-code/02-tasks.md`.

## Binding specs (live at repo root, NOT here)

The redesign is governed by files that already existed in the repo — the export's `uploads/`
folder contained byte-identical copies of them, so nothing was overwritten:

- `DESIGN.md` — design tokens, type, components, chrome rules, bans (the `@theme` ↔ spec contract).
- `PRODUCT.md` — brand voice, anti-references, the five design principles.

## ⚠️ `_ignored-cadence-ds/` is deliberately NOT used

The `claude-code-handoff/README.md` is explicit:

> If a generic design system (e.g. a bundled "Cadence" planner kit) is attached to the
> workspace, **ignore it** — its indigo/Onest/soft-radius language directly violates the
> DiScammer palette lock (cyan `#65def0`, JetBrains Mono, cool-dark canvas). Never introduce
> a second accent or a new aesthetic.

It's a calm AuDHD daily-planner kit (muted **indigo** accent, OKLCH violet-tinted neutrals,
soft radii, Onest type). Nothing about it belongs in DiScammer. It's retained here only so the
export is reproducible — do not import its tokens, colors, or components.

## The redesign is a *de-slop pass*, not a rebuild

The DiScammer concept (the anti-fraud analyst's briefing room) is kept. The work is **cadence,
hierarchy, restraint**: break the home three-card monotony, vary section rhythm, cut decorative
chrome, fix type hierarchy (Geist editorial vs JetBrains Mono data), add depth/asymmetry, stat
truth, subtle texture, micro-craft. See `claude-code-handoff/02-tasks-P0-P3.md` for the
file-scoped task list and `03-verification-ci.md` for the gate every change must pass.
