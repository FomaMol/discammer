# 00 — Orchestration (multi-agent topology)

The v2 implementation runs as **one lead orchestrator + six specialized subagents**. Each subagent
owns one layer, one branch, and a fixed skill set. The orchestrator never writes production code; it
plans, decomposes, assigns, resolves conflicts, and runs the convergence gate.

```
                         ┌──────────────────────────────┐
                         │   LEAD ORCHESTRATOR (A0)      │
                         │   skill: superpowers          │
                         │   plans · assigns · converges │
                         └──────────────┬───────────────┘
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
 ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
 │ A1 Design  │ │ A2 Type &  │ │ A3 Comp.   │ │ A4 Motion &│ │ A5 Copy &  │
 │ System     │ │ Fonts      │ │ Islands    │ │ Graphics   │ │ i18n       │
 │ impeccable │ │ GoogleFonts│ │ 21st.dev   │ │ webgpu-skl │ │ (authored) │
 │ taste      │ │            │ │ npxskillui │ │            │ │            │
 │ awesome-md │ │            │ │ uiux-pro   │ │            │ │            │
 │            │ │            │ │ stitch     │ │            │ │            │
 └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
       └──────────────┴──────────────┴──────────────┴──────────────┘
                                      ▼
                         ┌──────────────────────────────┐
                         │   A6 QA / VERIFICATION        │
                         │   skill: playwright-cli       │
                         │   a11y · visual-reg · i18n    │
                         └──────────────────────────────┘
```

## Agent roster & ownership

| Agent | Owns | Branch prefix | Primary files |
|---|---|---|---|
| **A0 Orchestrator** | plan, task graph, conflict resolution, convergence gate | — | this package |
| **A1 Design System** | tokens, surfaces, elevation, texture, radius | `ds/` | `frontend/src/styles/globals.css` (`@theme`), `DESIGN.md` |
| **A2 Type & Fonts** | self-hosted Geist + JetBrains Mono, the two-register rule | `type/` | `globals.css` `@font-face`, `base.html` `<head>` |
| **A3 Components/Islands** | React islands: checker, inspector, three-ways band, cards, meter, breadcrumb, action-module | `cmp/` | `frontend/src/components/*.tsx`, `frontend/src/main.tsx`, `backend/templates/*.html` |
| **A4 Motion & Graphics** | hero/game canvas, reveals, meter fill, reduced-motion | `mtn/` | `frontend/src/components/HeroCanvas.tsx`, motion utils |
| **A5 Copy & i18n** | RU/EN authored strings, parity, voice | `i18n/` | `backend/locales/{en,ru}.json`, `scripts/i18n_allowlist.txt` |
| **A6 QA/Verification** | a11y gate, visual-regression baselines, i18n audit, perf | `qa/` | `e2e/*.spec.ts`, CI config |

## Convergence protocol (how parallel work merges safely)

1. **Plan lock.** A0 publishes the task graph (`02-tasks.md`) and the dependency order. No agent
   starts a task whose upstream isn't merged.
2. **Token-first.** A1 + A2 land first (tokens + fonts) because every other agent consumes them. They
   are P0 and block the rest.
3. **Contract before code.** A3 and A4 agree on the island registry names and `data-props` shapes up
   front (a tiny `islands-contract.md`), so templates and components don't drift.
4. **One rebuild owner.** Only A3 runs `cd frontend && npm run build` and commits the rebuilt
   `backend/static/` artifact, to avoid CI drift conflicts. Others rebase on it.
5. **i18n gate is continuous.** A5 reviews every PR that adds a user-visible string; a PR with an
   unauthored or unpaired string cannot merge.
6. **Verification is the merge gate.** A6 runs the full suite (`03-verification.md`) on the integration
   branch. Red = bounce back to the owning agent with the failing artifact attached. Green = A0 merges.
7. **Brand-lock veto.** Any agent may flag a brand-lock violation; A0 resolves before merge. The lock
   list in `README.md` is non-negotiable.

## Communication rules
- Every subagent writes a 3-line status to the orchestrator after each task: *done / blocked-on /
  needs-decision*.
- Decisions that change the design system are escalated to A0 + A1 together, never made unilaterally.
- The reference file (`DiScammer v2.dc.html`) is the tie-breaker for "what should this look/behave
  like." If the reference and a skill suggestion conflict, the reference wins unless A1 approves.
