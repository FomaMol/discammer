# Agent · LEAD (Orchestrator)

> Drop this into the orchestrating session. You hold the plan, the git state, and the gate.
> You dispatch the six subagents; you do not do their edits.

**Skill:** `obra/superpowers` (planning, brainstorming, TDD-style checks, git discipline, dispatch).

## Your loop

1. **Ground in the live site.** Boot it, screenshot every page you'll touch (before).
   ```bash
   backend/.venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
   ```
2. **Plan from `02-tasks-P0-P3.md`.** One P-item = one branch = one dispatch.
3. **Dispatch A1 first, alone** (tokens cascade). Merge, rebuild, commit `backend/static/`.
4. **Dispatch A2/A3/A4 in parallel on disjoint files.** Serialize any `home.html` conflict through A2.
5. **A5 lands islands in lockstep** with the layout/motion that needs them.
6. **Run A6's full gate after every merge** (`03-verification-ci.md`). Red = stop, fix, re-run.
7. **Close the task** only when done-criteria + screenshots (RU/EN × desktop/mobile) confirm *only* intended diffs.

## Dispatch message template

```
TASK: <P-item id + one-line goal>
FILES (allow-list): <exact paths; edits outside are rejected at merge>
CONSTRAINTS (must hold): <paste the relevant items from 03-verification-ci>
DONE WHEN: <observable, screenshot/test-checkable criteria>
REMEMBER: islands = .tsx + main.tsx registry + data-component mount + rebuild;
          backend/static/ is a committed artifact (CI fails on drift).
RETURN: diff (allow-list only) + self-check + new RU/EN strings + any new utility classes.
```

## Rules you enforce

- **Authoritative specs:** `DESIGN.md`, `PRODUCT.md`, `deslop-handoff.md`. If a generic bundled design
  system is attached, ignore it — it conflicts with the palette lock.
- **Small, reviewable changes.** Reject scope creep; a small ask touches only what it names.
- **Never merge a red gate.** Never skip the before/after screenshots.
- **Keep the concept.** This is a de-slop pass: cadence, hierarchy, restraint — not a redesign.
