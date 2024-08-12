# 01 · Skill map

The eleven selected skills, mapped to the agent(s) that load them and **exactly what each is for**
in this pass. A skill is a tool, not a deliverable — its output is always filtered through the
DiScammer specs. "Read for technique, not appearance" applies to every inspiration source.

| # | Skill | Loaded by | Used for | Guardrail |
|---|-------|-----------|----------|-----------|
| 1 | **obra/superpowers** | Lead, A6 | Process spine: planning, brainstorming the layout options, TDD-style "write the check first", git discipline, subagent dispatch, the "verify before you claim done" loop. | Process only. Never lets a task skip the `03-verification-ci` gate. |
| 2 | **microsoft/playwright-cli** | A6 (primary), A5 | Drives the browser for the real gates: `a11y.spec.ts` (axe, 7 pages, color-contrast enforced), `visual.spec.ts` (`toHaveScreenshot`), and RU/EN × desktop/mobile capture. A5 uses it to snapshot island states (hover/focus/active). | Visual baselines are CI-seeded on Linux — refresh with `--update-snapshots` only for intended UI change. |
| 3 | **fonts.google.com** | A3 | Source + load **Geist** and **JetBrains Mono** (preconnect + `display=swap`), with full **Cyrillic** subsets. Confirm x-height parity Latin↔Cyrillic at 24px for the mono labels. | No Inter, no Press Start 2P, no third family. No render-blocking `@import`. |
| 4 | **Leonxlnx/taste-skill** | A1, A2, A4 | A craft/critique pass on every returned diff: is the hierarchy clear, the spacing intentional, the restraint held? Run it **before** the agent reports done. | Taste serves the brand's restraint, not novelty. It cannot authorize a new accent or effect. |
| 5 | **21st.dev** | A2, A5 | Reference patterns for bento, asymmetric cards, list rows, carousels, the inspector/search inputs. Adapt structure; re-skin entirely to DiScammer tokens. | Never paste a component's look. Strip its palette/radii/shadows; rebuild against `globals.css`. |
| 6 | **nextlevelbuilder/ui-ux-pro-max-skill** | A2 | UX heuristics for the de-slop: information hierarchy, scan-path, role-differentiated cards, editorial cadence (loud→quiet→loud), 44px hit targets, inline-disclosure over modals. | Mobile-first; Cyrillic needs ~10–15% more width. |
| 7 | **stitch.withgoogle.com** | A2 | Rapid **layout exploration** for the P0 streams (featured-lead interview, dated newsletter list, 2-up articles) before committing code — generate 2–3 rhythms, pick, then hand-build in Jinja. | Output is a sketch to react to, never shipped markup. Re-author in the real templates. |
| 8 | **VoltAgent/awesome-design-md** | A1 | Reference `DESIGN.md` craft from Warp/Vercel/Linear/Raycast etc. for **technique** — token structure, elevation systems, motion tokens — to keep `globals.css` ↔ `DESIGN.md` rigorous. | Read for technique, copy nothing's appearance. DiScammer's palette/voice is fixed. |
| 9 | **dgreenheck/webgpu-claude-skill** | A4 | *Optional, gated* single hero graphics moment if the team wants more than the Canvas ambient — e.g. a GPU particle/scan field on the hero or game launcher. | The web is the **quieter** surface — don't out-game the game. `prefers-reduced-motion` disables it; GPU-only `transform`/`opacity`; ≤12 particles, drift < 0.4px/frame, no mesh-gradient blobs. Recommend Canvas2D first; reach for WebGPU only on the game launcher. |
| 10 | **amaancoderx/npxskillui** | A5 | Scaffold new island components fast (the link inspector, message analyzer, content search) so A5 spends time on logic + a11y, not boilerplate. | Output must conform to the islands pattern: `.tsx` + `main.tsx` registry entry + `data-component` mount, then rebuild. |
| 11 | **pbakaus/impeccable** | A1, A3 | The premium-craft + **generic-AI-pattern checklist**: catches the slop tells (every-section scanlines, glow-on-every-accent, three-equal cards, hero-metric template, em dashes, AI marketing words). Its shared bans sit beside DiScammer's project bans. | Enforced as a gate item, not a suggestion. See the bans block in `DESIGN.md`. |

## Skill → agent quick index

- **Lead:** superpowers
- **A1 Design-System Steward:** impeccable · taste-skill · awesome-design-md
- **A2 De-slop Layout:** ui-ux-pro-max-skill · stitch · 21st.dev · taste-skill
- **A3 Type & i18n:** fonts.google.com · impeccable
- **A4 Motion & GFX:** webgpu-claude-skill · taste-skill
- **A5 Islands Eng.:** npxskillui · 21st.dev · playwright-cli
- **A6 QA:** playwright-cli · superpowers
