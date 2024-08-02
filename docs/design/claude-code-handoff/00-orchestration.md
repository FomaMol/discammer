# 00 · Multi-agent orchestration

The de-slop pass is run by **one lead (orchestrator) agent** that owns the plan, the git state,
and the verification gate, dispatching **six specialist subagents** that each own a narrow slice
of the codebase. Subagents never run the full pipeline; the lead does. Subagents return a diff +
a self-check; the lead merges only after A6 (QA) is green.

```
                         ┌─────────────────────────────┐
                         │   LEAD · Orchestrator        │
                         │   skill: superpowers         │
                         │   owns: plan, git, gate,     │
                         │   merge order, before/after  │
                         └──────────────┬──────────────┘
            dispatch (scoped task + the 3 specs + done-criteria)
   ┌───────────┬───────────┬───────────┼───────────┬───────────┐
   ▼           ▼           ▼           ▼           ▼           ▼
 ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
 │ A1   │   │ A2   │   │ A3   │   │ A4   │   │ A5   │   │ A6   │
 │Design│   │De-   │   │Type &│   │Motion│   │Island│   │QA /  │
 │System│   │slop  │   │ i18n │   │ & GFX│   │ Eng. │   │Verify│
 │Stew. │   │Layout│   │      │   │      │   │      │   │      │
 └──────┘   └──────┘   └──────┘   └──────┘   └──────┘   └──────┘
```

## Agent roster

| ID | Agent | Primary skills | Owns (files) |
|----|-------|----------------|--------------|
| **Lead** | Orchestrator | `superpowers` | the plan, git branches, merge order, before/after screenshots |
| **A1** | Design-System Steward | `impeccable`, `taste-skill`, `awesome-design-md` | `frontend/src/styles/globals.css` (`@theme`) ↔ `DESIGN.md` sync; bans + palette lock |
| **A2** | De-slop Layout Architect | `ui-ux-pro-max-skill`, `stitch`, `21st.dev`, `taste-skill` | `backend/templates/*.html`, `ContentCarousel.tsx`, `JournalBroadsheet.tsx`, `ScamTypesGrid.tsx` |
| **A3** | Typography & i18n | `fonts.google.com`, `impeccable` | font loading in `base.html`/`globals.css`; `backend/locales/{en,ru}.json`; `scripts/i18n_allowlist.txt` |
| **A4** | Motion & Graphics | `webgpu-claude-skill`, `taste-skill` | `ParticleBackground.tsx`, `HeroTypewriter.tsx`, `GlitchText.tsx`, reveal/stagger utils, reduced-motion gates |
| **A5** | Islands Engineer | `npxskillui`, `21st.dev`, `playwright-cli` | `frontend/src/components/*.tsx`, `frontend/src/main.tsx` registry, the inspector/analyzer/search islands |
| **A6** | QA / Verification | `playwright-cli`, `superpowers` | `e2e/*.spec.ts`, the full gate in `03-verification-ci.md`, RU/EN × desktop/mobile screenshots |

## Dispatch contract (what the lead hands each subagent)

Every dispatch message MUST contain:

1. **One P-item** from `02-tasks-P0-P3.md` (never a vague "make it nicer").
2. **The exact file allow-list** for that agent + task. Edits outside it are rejected at merge.
3. **The relevant hard constraints** from `deslop-handoff.md` (copied inline, not linked).
4. **Done-criteria** — observable, screenshot- or test-checkable.
5. The reminder: *islands = 3 edits + rebuild; `backend/static/` is a committed Vite artifact.*

## Return contract (what each subagent hands back)

1. A diff limited to its allow-list.
2. A self-check: which done-criteria it believes it met, with before/after screenshots of the
   touched page (the agent's own skill, e.g. `taste-skill`, applied as a critique first).
3. Any new strings added to **both** `en.json` and `ru.json` (authored RU, not translated).
4. A note on any new utility classes (so the lead knows a Tailwind rebuild is required).

## Parallelization & merge order

- **A1 goes first, alone.** Token changes cascade through every component; merging A1 last would
  invalidate everyone's work. Land `globals.css` ↔ `DESIGN.md` parity, merge, rebuild.
- **A2, A3, A4 run in parallel** only on **disjoint files**. The home page is A2's; A3 touches type
  tokens + locales; A4 touches motion components. Conflicts on `home.html` are serialized through A2.
- **A5 lands in lockstep with A2/A4** — a new layout (A2) or animation (A4) that needs a new island
  is three coordinated edits: `.tsx` + `main.tsx` registry + the `<div data-component>` in the template.
- **A6 runs after every merge.** A red gate blocks the next dispatch. No exceptions.

## Suggested sequence (max impact, min risk — from `deslop-handoff.md`)

1. A1 token/parity pass (unblocks all). →
2. A2 P0: break the home three-card monotony (one asymmetric/featured stream). →
3. A2 P0/P1: vary section rhythm + cut decorative chrome. →
4. A3 P1: type hierarchy (Geist editorial vs mono data; 500/600 weights; balance/pretty; measure). →
5. A2+A1 P1: depth + asymmetry (overlap, tinted shadows, role-differentiated cards). →
6. A3+A5 P2: stat truth (real numbers only) + A4+A1 subtle texture on flat darks. →
7. A4+A1 P3: micro-craft (optical alignment, spring-ish easing, staggered reveals).

Each step is one branch, one review, one green gate.
