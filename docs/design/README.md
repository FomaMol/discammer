# docs/design — redesign source material

Unpacked from the **Claude Design** export *"Redesign Discammer сайта.zip"* (ingested 2026-06-20).
The zip is deleted; everything worth keeping lives here.

## What's here

| Path | What it is | Status |
|---|---|---|
| `deslop-handoff.md` | **The authoritative audit.** P0–P3 slop tells grounded in the live build, hard constraints, verify steps, suggested order. | Source of truth |
| `claude-code-handoff/` | Operationalizes the audit into a multi-agent plan (LEAD + A1–A6), a skill map, file-scoped P0–P3 tasks, and the CI gate. | Source of truth |
| `redesign-canvas/` | The Claude Design canvas artifacts — visual targets to react to. `*.dc.html` open in a browser (they pull `support.js`, the canvas runtime). `thumbnail.png` / `check.png` are previews; `audit-shots/` are the screenshots fed into the design session. | Reference only |
| `deslop-handoff-v2/` *(if present later)* | — | — |
| `_ignored-cadence-ds/` | A generic "Cadence" planner design system that Claude Design auto-attached. **Explicitly out of scope** — see below. | **IGNORED** |

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
