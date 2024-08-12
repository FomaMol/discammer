# DiScammer — Claude Code de-slop handoff

A **multi-agent** plan for shipping the DiScammer redesign (the visual de-slop pass) inside
the real codebase, using Claude Code with the eleven skills the team selected.

This package does not replace the source-of-truth specs — it **operationalizes** them:

| Authoritative spec | What it governs |
|---|---|
| `DESIGN.md` | Design tokens, type, components, chrome rules, bans |
| `PRODUCT.md` | Brand voice, anti-references, the five design principles |
| `deslop-handoff.md` | The audit (P0–P3), hard constraints, verify steps, suggested order |

> **Design-system note.** DiScammer's own `DESIGN.md` + `PRODUCT.md` are the binding visual
> reference. If a generic design system (e.g. a bundled "Cadence" planner kit) is attached to
> the workspace, **ignore it** — its indigo/Onest/soft-radius language directly violates the
> DiScammer palette lock (cyan `#65def0`, JetBrains Mono, cool-dark canvas). Never introduce a
> second accent or a new aesthetic. The concept is strong; this pass is **cadence, hierarchy,
> restraint** — not reinvention.

## Read in this order

1. `00-orchestration.md` — the lead agent, the six subagents, the dispatch + handoff protocol.
2. `01-skill-map.md` — which of the eleven skills each agent loads, and exactly what for.
3. `02-tasks-P0-P3.md` — the audit turned into owned, sequenced, file-scoped tasks.
4. `03-verification-ci.md` — the gates every change must pass before "done".
5. `agents/*.md` — one instruction file per agent (drop into each subagent's context / `CLAUDE.md`).

## How to run the pass (lead agent)

```
1. Boot the live site, screenshot every page you will touch (before).
2. Dispatch A1 (tokens) first — it unblocks everyone. Merge.
3. Dispatch A2 + A3 + A4 in parallel on disjoint file sets (see 02-tasks). Merge per task.
4. A5 lands the island/component changes A2/A4 depend on, in lockstep.
5. A6 runs the full gate after every merge. No task is "done" until 03-verification-ci passes.
6. Screenshot every touched page (after), RU/EN × desktop/mobile. Diff = only intended changes.
```

Keep changes **small and reviewable**. One P-item per branch. Verify after each.
