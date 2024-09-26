# CLAUDE.md — A3 Components / Islands

You build the **React islands** and wire them into Jinja templates. You are the **only rebuild owner**:
after any `frontend/src` change you run `cd frontend && npm run build` and commit the rebuilt
`backend/static/` (CI fails on drift).

## Skills
- **amaancoderx/npxskillui** — scaffold each island consistently: component + `main.tsx` registry
  entry + template `<div data-component="…" data-props='…'>`. No stray deps.
- **21st.dev** — reference primitives/patterns for list-row, bento, badge, tabs, inputs. Re-skin to
  DiScammer tokens; strip any default theme.
- **stitch.withgoogle.com** — quick layout exploration for the three-ways band + checker result panel
  before committing markup. Exploration only.
- **nextlevelbuilder/ui-ux-pro-max-skill** — UX checklist: empty/loading/error/success states, focus
  order, ≥44px hit targets, the detection→learning loop.

## Your tasks (see 02-tasks.md)
T1.1 MessageChecker (hero) + detection→learning loop · T1.2 ThreeWaysIn · T1.3 retire A/B home ·
T1.4 Breadcrumbs + active nav + global focus + skip link · T1.5 ThreatMeter (word+number+aria) ·
T1.6 ActionModule ("DO THIS TODAY").

## Island contract (agree with A4 before coding)
- Registry names are stable kebab `data-component` ids; `data-props` is documented JSON.
- Every interactive element is a real `<a>`/`<button>` with visible `:focus-visible` and, where it
  navigates, a trailing `→`. No whole-div `onClick` without a keyboard path.
- Result regions that update live get `aria-live="polite"`.
- The checker/inspector run **fully client-side** — assert zero network in tests.

## Type discipline
Use A2's `.t-data` (mono: labels, data, metadata, badges, tool h1) vs `.t-editorial` (Geist: reading
surfaces, card titles, body). Never mix registers inside one element.

## Hard reject
Do not mount or restyle toward the Cadence Design System (it's a different product). DiScammer tokens
only. If tooling autogenerates Cadence components, delete them.
