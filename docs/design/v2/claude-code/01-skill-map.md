# 01 — Skill map (every skill → agent → concrete use)

All eleven skills from the brief are assigned a specific owner and a specific job. A skill is used
**for technique, never to import an appearance** — the DiScammer brand lock overrides any skill's
default look. If a skill's output conflicts with `00-DESIGN-SYSTEM-v2.md`, the design system wins.

| # | Skill | Owner | What it's used for (concretely) | Guardrail |
|---|---|---|---|---|
| 1 | **obra/superpowers** | A0 Orchestrator | Workflow + brainstorming + planning discipline to decompose the v2 epic into the task graph, run the multi-agent loop, and keep scope honest. | Planning only; never ships UI. |
| 2 | **microsoft/playwright-cli** | A6 QA | Drive the browser for the a11y axe sweep, visual-regression `toHaveScreenshot` baselines, keyboard-path tests, and the checker/inspector interaction tests, RU/EN × desktop/mobile. | Tests behavior, not vibes; baselines refreshed only for intended diffs. |
| 3 | **fonts.google.com** | A2 Type & Fonts | Source Geist + JetBrains Mono (both with full Cyrillic), self-host via `@font-face` with `font-display:swap` + preconnect; verify x-height parity Latin/Cyrillic. | No Inter, no pixel font, no render-blocking `@import`. |
| 4 | **Leonxlnx/taste-skill** | A1 Design System | Sanity-check spacing rhythm, restraint, and "does this feel premium or templated" on each surface before A6 sees it. | Taste serves the locked brand, not a new one. |
| 5 | **21st.dev** | A3 Components | Reference patterns/primitives for the list-row, bento, badge, tabs (journal filter), and input affordances — adapted to tokens, not pasted. | Re-skin to DiScammer tokens; strip any default theme. |
| 6 | **nextlevelbuilder/ui-ux-pro-max-skill** | A3 Components | UX-pattern checklist for states (empty/loading/error/success), focus order, hit-targets ≥44px, and the detection→learning loop wiring. | Patterns must pass A6's a11y gate. |
| 7 | **stitch.withgoogle.com** | A3 Components | Rapid layout exploration for the "three ways in" band and the checker result panel before committing the island markup. | Exploration only; final markup is hand-built to tokens. |
| 8 | **VoltAgent/awesome-design-md** | A1 Design System | Reference other product `DESIGN.md`s (Warp, Vercel, Raycast, Linear) for *technique* on tokens, motion tiers, and doc structure when syncing `DESIGN.md` ↔ `globals.css`. | Read for technique; never copy appearance. |
| 9 | **dgreenheck/webgpu-claude-skill** | A4 Motion & Graphics | Evaluate whether the hero/game ambient should upgrade from Canvas2D to a **gated, reduced-motion-safe WebGPU** field. Default stays Canvas2D (the web is the *quieter* surface); WebGPU only if it stays ≤ the game's intensity and degrades cleanly. | Must honor reduced-motion + perf budget; never out-game the game. |
| 10 | **amaancoderx/npxskillui** | A3 Components | Scaffold the React island boilerplate (component + registry entry + template `data-component` div) fast and consistently across the new islands. | Output conforms to the islands-contract; no stray deps. |
| 11 | **pbakaus/impeccable** | A1 Design System | The premium-craft + generic-AI-pattern checklist applied to every surface: kill templated uniformity, audit optical alignment, tinted shadows, micro-craft. | Impeccable's bans + DiScammer's bans both apply; union of the two. |

## How the skills sequence in a single task (example: the "three ways in" band)
1. **A0/superpowers** scopes it and assigns A3 with the acceptance criteria.
2. **A3/stitch** explores 2–3 layouts; **A3/21st.dev** borrows the cell/affordance pattern.
3. **A3/npxskillui** scaffolds `ThreeWaysIn.tsx` + registry + template div.
4. **A3/ui-ux-pro-max** verifies hit-targets, focus order, and the "which is right for me" helper.
5. **A1/impeccable + taste** crit it for templated-uniformity and craft; **A1** confirms tokens.
6. **A5** authors RU + EN strings; **A2** confirms the type registers (mono verb / Geist line).
7. **A6/playwright** adds the a11y + visual-regression + keyboard test; baselines on green.

The same chain applies to the checker, inspector, cards, meter, breadcrumb, and action-module.
