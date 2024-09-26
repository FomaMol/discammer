# DiScammer v2 → Claude Code handoff (multi-agent)

This package tells a **Claude Code multi-agent run** how to ship the v2 ("Field Office") redesign onto
the real DiScammer stack (Jinja SSR + React islands + Tailwind v4). It is intentionally split so a
**lead orchestrator** can fan work out to specialized **subagents**, each owning one layer and one set
of skills, then converge through a single verification gate.

## Read order
1. `00-orchestration.md` — the agent topology, who owns what, the convergence protocol.
2. `01-skill-map.md` — every external skill mapped to the agent and task that uses it.
3. `02-tasks.md` — the concrete v2 work, P0→P3, tied to real repo files, with acceptance criteria.
4. `03-verification.md` — the CI gates each PR must pass before merge.
5. `agents/*.md` — drop-in `CLAUDE.md`-style briefs, one per subagent.

## The source of truth for *what to build*
- `../00-DESIGN-SYSTEM-v2.md` — the v2 design system + UX audit (authoritative).
- `../../DiScammer v2.dc.html` — the working reference implementation. Agents port its decisions to
  the production stack; they do not re-invent them.
- `../reviews/01-senior-designer-review.md` — the blockers/should-fixes to honor.

## Hard rule for every agent
The brand is **locked**: cyan `#65def0`, JetBrains Mono + Geist, cool-dark canvas, one accent system,
WCAG AA enforced, RU/EN authored parity, reduced-motion honored, no second accent, no gradient text,
no pixel font. Any change that touches these is rejected at review. When in doubt, the agent stops and
asks the orchestrator rather than guessing.

## One-line summary of the job
Turn the v1 "brochure you look at" into the v2 "tool you use": lead with the live checker, add the
"three ways in" clarity band, enforce the two-register type rule, wire detection→learning, add
breadcrumbs + focus + the reusable action-module — without breaking the locked brand or CI.
