# DiScammer redesign — phase handoff (v1 + v2)

> **Read this first when continuing the redesign in a fresh session.**
> Written 2026-06-20 after the v1 (editorial-cadence) and v2 ("Field Office") passes shipped.
> Everything here is **already on production** unless a section says otherwise.

---

## 0. TL;DR / current state

- **Prod = `cd43da1`** (`https://discammer.com/api/health` → `version`). `main` == `origin/main` == prod. **Working tree clean.**
- **`git push origin main` triggers the CI deploy to prod.** Only push on the owner's explicit decision.
- Two redesign passes shipped, both from **Claude Design** exports that live in `docs/design/`:
  - **v1 "editorial cadence"** — new home, new nav, all 8 inner pages.
  - **v2 "Field Office"** — UX-clarity layer on top of v1 (checker-led hero, "Three ways in", word+number meters, "DO THIS TODAY" module, breadcrumbs).
- The brand is **locked** and was never touched: cyan `#65def0`, JetBrains Mono + Geist, cool-dark canvas `#0b0f1a`, one accent system (cyan + semantic amber/green/red), WCAG AA enforced, RU/EN authored parity, reduced-motion honored.

---

## 1. The stack (what a new session must know)

FastAPI **SSR (Jinja2)** + **React islands** + **Tailwind v4**. See root `CLAUDE.md` for commands. Non-obvious essentials:

- **Islands.** A new interactive widget = **3 edits**: the `.tsx` in `frontend/src/components/`, a registry entry in `frontend/src/main.tsx`, and a `<div data-component="Name" data-props='…'>` mount in a Jinja template. Then rebuild. `main.tsx` mounts into `[data-component]` elements and **preserves the inner HTML as the no-JS fallback** — so put a `<noscript>` (or static fallback) inside the mount.
- **`backend/static/` is a committed Vite artifact.** After ANY `frontend/src` change (or a new Tailwind class used only in a template — Tailwind v4 scans templates via `@source`): `cd frontend && npm run build` and **commit the rebuilt static**. CI fails on drift (`git diff --exit-code -- backend/static`). **The build is deterministic** (a second build yields identical hashes), so a macOS commit passes the Linux CI diff — verified repeatedly this phase.
- **i18n.** Every user-facing string lives in `backend/locales/{en,ru}.json`, **authored RU (not literal translation)**, `PRODUCT.md` voice (no em-dashes, no AI words). Server templates use `t(_lang, 'a.b')`; React islands bind `makeTranslator('ns')` → `client.ns.key`. `scripts/i18n_audit.py` enforces **0 dead / 0 missing / en == ru**.
  - **Runtime-built keys are invisible to the audit** (e.g. `` tr(`lvl_${n}`) `` or `t(_lang, 'threat.lvl_' ~ n)`). Add them to `scripts/i18n_allowlist.txt`. (This phase added `client.checker.lvl_1..5` and `threat.lvl_1..5`.)
  - **Arrows rule:** heading locale strings are plain text; the decorative `>`/`→` is a separate `aria-hidden` span in the consumer, never inside the string.
- **Colors / a11y tokens.** Body text ≥ 4.5:1; large/non-text ≥ 3:1. Use **`#8b94a8` (ink-mute) for small muted TEXT** and **`#6b7588` (ink-dim) for NON-TEXT decoration ONLY** (aria-hidden glyphs, hairlines). Using `#6b7588` for ~10px text **fails AA (≈4.1–4.3:1)** and the axe gate catches it — this bit twice this phase.

---

## 2. Where the source material lives

`docs/design/` (all ingested from the Claude Design zips; the zips were deleted after extraction):

| Path | What |
|---|---|
| `README.md` | Index of v1 vs v2. |
| `deslop-handoff.md` | v1 audit (P0–P3 slop tells). |
| `claude-code-handoff/` | v1 multi-agent plan (LEAD + A1–A6). |
| `redesign-canvas/DiScammer-Redesign.dc.html` | **v1 reference canvas** (open in a browser; pulls `support.js`). |
| **`v2/00-DESIGN-SYSTEM-v2.md`** | **v2 authoritative DS + UX audit (U0–U8).** |
| **`v2/DiScammer-v2.dc.html`** | **v2 reference canvas** (+ `support.js`, `thumbnail.png`). |
| **`v2/claude-code/02-tasks.md`** | **v2 build plan, P0→P3 (the backlog).** |
| **`v2/claude-code/03-verification.md`** | v2 gate + the new acceptance tests the package wants. |
| `v2/reviews/` | senior-designer + university-portfolio crits (blockers to honor). |
| `_ignored-cadence-ds/` | A generic indigo "Cadence" planner kit Claude Design auto-attaches. **NEVER import it** — it violates the palette lock. The adherence warning about its un-loaded bundle is expected; ignore it. |

> The `.dc.html` canvases use `<sc-if>`/`sc-for`/`{{ … }}` placeholders + CSS custom props (`var(--ink)` etc.). When porting, convert those to real Jinja wired to real data + inline HEX colors. The canvases also include a private **A/B "rhythm" switcher** — that is a design-review affordance and **must never appear in prod templates** (v2 T1.3).

---

## 3. What shipped this phase (the commit arc)

Read newest→oldest; each `Merge … (deploy)` is a CI-gated prod deploy.

```
cd43da1  Merge v2 'Field Office' (deploy)        ← current prod
407a81b  v2(P1/P2): meter words, action module, breadcrumbs, tokens
5c620cc  v2(P1): checker-led hero + "Three ways in"
118f63d  docs: ingest v2 package
b6a8e44  redesign(pages): the remaining 8 canvas artboards
5e0de20  redesign(nav): site nav
f7ce3e4  fix(e2e): home smoke island HeroTerminal -> HeroShader
e57ed5e  Merge redesign: home editorial-cadence (HOME A) (deploy)
…        (de-slop pass: d15ce6d / 5f0a700 / 27a1248 — superseded by the full redesign)
6d64170  docs: ingest v1 export
```

### v1 — what's live
- **Home** = the editorial-cadence canvas (HOME A): asymmetric hero, interview featured-lead, dated newsletter list, threat-DB bento, article 2-up, "Install the pause" course CTA. Fully SSR.
- **Nav** (`base.html`) = the canvas SITE NAV: reticle scope-mark logo + DISCAMMER, 4 links (COURSE/JOURNAL/CHECK/INSPECT), search **icon**, segmented **EN|RU** toggle, solid-cyan **"Start the course"** CTA. 56px tall → `<main>` is `pt-14`. Mobile keeps `MobileMenu`.
- **8 pages** redesigned: `guide` (case-file band + meter strip + § counters + line-number gutter + TOC), `post`/article (editorial header), `journal` ("desk log" masthead), `course` ("Install the pause" + syllabus terminal), `game` ("Antifraud Hero" launcher), `404` (`trace_route.log`), `inspect`/`search` (redesigned shells around the tool islands).
- **All React islands preserved** (KnowledgeCheck / VideoPlayer / CourseProgress / GameLauncher / LinkInspector / SearchConsole / JournalBroadsheet). The home's only island is now **HeroShader** + (v2) **MessageChecker**.

### v2 "Field Office" — what's live (the UX-clarity layer)
- **T1.1 checker-led hero** — `frontend/src/components/MessageChecker.tsx` (NEW). Reuses the **pure `analyze()` engine** from `frontend/src/data/redflags.ts` (same one the `/check` `MessageAnalyzer` uses), runs **debounced + fully client-side** (nothing sent/stored), shows `bars + LVL n/5 + WORD`, the named first-pass tells, and a **per-tell "read the matching dossier →" guide link** (the detection→learning loop). Results region is `aria-live`. Mounted in `home.html` hero right column with the incident-feed as `<noscript>` fallback.
- **T1.2 "Three ways in"** band in `home.html`: Learn (`/course`) · Check (`/check`) · Practice (`/game`), real `<a>` cards, trailing arrows, ≥44px hit areas.
- **T1.5 word+number meters** — home featured + grid + guide case-file now read `LVL n/5 · WORD`. Words = `threat.lvl_1..5` (LOW/GUARDED/ELEVATED/HIGH/CRITICAL), **allowlisted** because the key is built at runtime.
- **T1.6 "DO THIS TODAY"** — `backend/templates/_action_module.html` (NEW Jinja macro). Imported `with context` and called at the end of `guide`/`post`/`inspect` (→ `/check`) and `course` (→ `/game`). One primary action per page.
- **T1.4 breadcrumbs** added to `inspect` + `search` (guide/article/course already had them). Global focus ring + skip link were already in place from v1.
- **T0.1/T0.2** — `--shadow-panel` / `--shadow-pop` tinted elevation tokens + `.t-data` / `.t-editorial` two-register utilities + `.ds-grain`, in `frontend/src/styles/globals.css`, documented at the bottom of root `DESIGN.md`.

---

## 4. The verify + deploy flow (run this every time)

```bash
cd frontend && npx tsc --noEmit && npm run build && npm test   # type + build + vitest; COMMIT rebuilt backend/static
cd .. && backend/.venv/bin/python -m pytest -q                 # backend
backend/.venv/bin/python scripts/i18n_audit.py                 # 0 dead / 0 missing / en==ru
cd e2e && npx playwright test                                  # a11y (axe, 7 pages) + smoke + nav + analyzer + … (49 tests)
```

All green = `git add` the source **and** `backend/static`, commit, then (on the owner's go) merge to `main` and `git push` → CI deploys. Deploy is gated on **backend-tests + frontend-build (static drift) + docker-build + dockerized e2e**, with a post-deploy O3 smoke + auto-rollback.

**Browser verification:** boot the FastAPI app (the preview server, `discammer-backend` launch config) — NOT the Vite dev server, which only serves islands in isolation. Verify SSR pages + screenshot against the relevant `.dc.html` canvas.

---

## 5. Gotchas that bit this phase (and the fixes) — READ THESE

1. **Stale preview/dev server.** The FastAPI server **caches the Vite manifest AND the locale JSON at startup.** After a rebuild or a locale edit you MUST **restart the server**, or you get a 404'd CSS hash (unstyled page) and `t()` returning raw keys. The e2e `webServer` has `reuseExistingServer: true` locally — a running stale preview server makes **every e2e fail**. Kill it (`lsof -ti:8000 | xargs kill -9`) before running e2e.
2. **Inline `grid-template-columns` can't be overridden by a `lg:` class** (inline wins). Use `class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"` — never an inline base + a responsive class. (Broke the home hero 2-col once.)
3. **Smoke test hard-codes the home island.** `e2e/helpers.ts` `PAGES` asserts a `[data-component]` hydrates per page. The home's island changed across this phase (HeroTerminal → HeroShader); keep that entry pointing at an island that actually renders a child (HeroShader always renders a `<canvas>`).
4. **a11y small-text contrast** — `#6b7588` (ink-dim) is **non-text-only**; for ~10px text use `#8b94a8`. Axe catches it; it failed the gate twice (course badge, then the v2 checker privacy line + Three-ways tags).
5. **Dead-key pruning.** When a redesign drops a page's old strings, `i18n_audit.py` flags them DEAD. Capture the audit's "DEAD backend keys" list and prune from both locales (a small Python loop) — re-audit until clean. (Pruned 51 + 63 keys across the page redesigns.)
6. **Obsolete tests after a redesign.** Removing a feature breaks its test: the 404 redesign needed the pytest marker updated (`dcm-ops@nav` → `trace_route.log`), and the course's `MissionBriefingTerminal` removal needed `motion.spec.ts` repointed. Update the test to the new reality; don't delete coverage blindly.
7. **Visual-regression baselines** (`visual.spec.ts`) are **Linux-seeded in CI** and are `continue-on-error`. Every redesign deploy is an intended visual change, so this step keeps flagging until someone runs the one-time CI `--update-snapshots` reseed (see `docs/deploy/visual-regression.md`). It has **never blocked a deploy**, but it's the standing housekeeping item — **do NOT regenerate baselines on macOS** (they won't match Linux).
8. **The committed `backend/static` can go STALE and fail the CI drift guard with NO source change — rebuild + commit before every push-to-deploy.** CI builds with `setup-node node-version:"20"` + `npm ci` + `npm run build` (the script `rm -rf`s `js/css/.vite` first, so each build is clean — no orphan accumulation), then `git diff --exit-code -- backend/static`. The first T0.2 deploy push **failed this guard**: a fresh build emitted `css/main-CsmcWZYL.css` (+ matching chunks) while the committed artifact was the older `main-Bwn1Hm0s` set — the committed static had silently gone stale. Likely cause: a GitHub runner/toolchain update during the **Node-20 deprecation rollout** shifted the build output (the prior deploy ~3h earlier still matched the old hashes). **Local build == CI build** — verified that local **Node 25** and CI **Node 20.20.2** BOTH emit `CsmcWZYL`, deterministically (the build is Node-version-independent here; an earlier "Node 20 vs 25 differ" note in this file was WRONG and is retracted). **Fix that unblocked the deploy:** `cd frontend && npm ci && npm run build`, then commit the rebuilt `backend/static`. **Rule going forward: before any push to `main`, run `npm ci && npm run build` and commit whatever `backend/static` changes result — don't assume the committed artifact is current.** `npm run build` deletes only `js/css/.vite`, never `backend/static/fonts/`, so a rebuild is safe for the self-hosted fonts.

---

## 6. What is NOT done — the backlog for the next session

Authoritative list: **`docs/design/v2/claude-code/02-tasks.md`** (P2/P3) + the package's own caveat.

- **Staggered scroll-reveals (P3, T3.1 entrance tier) — deliberately NOT shipped.** The v2 package itself cut them: a `[data-reveal] { opacity:0 }` initial state strands content when the runtime re-renders the island subtree (a prior `ScrollReveal` did exactly this — see `frontend/src/main.tsx:78`). The **safe** place to add scroll-entry motion is **inside each React component's own render** (reveal state lives in the component), which the handoff's A4 "Motion" agent is scoped to do. Until then everything renders visible by default — which is correct.
- **Self-hosted fonts (P0 T0.2) — DONE on branch `v2-self-hosted-fonts` (not yet deployed).** Geist (`400..700`) + JetBrains Mono (`400..800`) self-hosted as **variable woff2** under `backend/static/fonts/` (latin/latin-ext/cyrillic/cyrillic-ext only — greek/vietnamese dropped), with an inlined `@font-face` block + `font-display:swap` in `base.html` and a **lang-aware** `<link rel=preload as=font crossorigin>` (EN = latin; **RU = cyrillic + latin**, because RU pages also show the Latin DISCAMMER wordmark / brand / punctuation). Google Fonts CDN + preconnect removed; OFL attribution in `backend/static/fonts/OFL.md`. New gates `e2e/perf.spec.ts` + `e2e/cyrillic-layout.spec.ts`. Metric-matched `size-adjust` fallbacks were evaluated and **deliberately deferred** (cross-platform `local()` + xAvg-basis fragility; same-origin preload already removes the dominant swap shift — see `DESIGN.md`). Full gate green; **zero `backend/static` drift** (no `frontend/src` touched).
- **WebGPU hero spike (P3 T3.2)** — optional; default keep Canvas2D (`HeroShader`). Only ship if reduced-motion-safe and ≤ the game's intensity.
- **P2 polish** — section-rhythm temperature pass, a true container-breaking feature peak, `--grain` applied to terminal wells specifically (currently a global body grain + the opt-in `.ds-grain` utility exists but isn't wired everywhere), micro-craft optical alignment.
- **`/check` page** — was left on its v1 layout; the v2 canvas has no dedicated CHECK artboard (its analyzer only appears embedded in the unused HOME B). The new hero `MessageChecker` is the compact teaser; `/check`'s full `MessageAnalyzer` could get the same v2 polish.
- **The v2 package's new acceptance tests** (`docs/design/v2/claude-code/03-verification.md`): `checker.spec.ts`, `meter-grayscale.spec.ts`, `three-ways.spec.ts`, `focus-skiplink.spec.ts`, `no-ab-switcher.spec.ts`, `cyrillic-layout.spec.ts`, `perf.spec.ts` — not yet authored. The existing suite already covers a11y/smoke/analyzer; these would harden the v2-specific guarantees.

---

## 7. How to continue (suggested first moves in the new session)

1. Read this file, then `docs/design/v2/00-DESIGN-SYSTEM-v2.md` and `…/claude-code/02-tasks.md`. Open `docs/design/v2/DiScammer-v2.dc.html` in a browser as the visual reference.
2. Confirm clean baseline: `git status`, `git rev-parse --short HEAD` should == prod `/api/health` version.
3. Cut a branch (`git checkout -b v2-<task>`). Pick a P2/P3 item above. Port its decisions from the v2 canvas — don't reinvent.
4. Build → run the full gate (§4) → **restart the preview server** → verify in-browser → fix → re-gate. Mind §5.
5. Deploy only on the owner's go; after deploy, remember the visual-baseline reseed is the standing follow-up.

**Key files:** `backend/templates/home.html` · `base.html` · `_action_module.html` · `frontend/src/components/MessageChecker.tsx` · `frontend/src/data/redflags.ts` (the analysis engine) · `frontend/src/styles/globals.css` · `backend/locales/{en,ru}.json` · `scripts/i18n_audit.py` + `i18n_allowlist.txt` · `e2e/helpers.ts`.
