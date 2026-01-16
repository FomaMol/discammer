# Course lesson contract v2

A normal lesson keeps its existing `{module}/{slug}.{en|ru}.json` filename, `order`, title and `body_md`. The Markdown body is the substantial explanation, with mechanisms and limits. For v2 set `widget_type` to `course_v2` and put the following authored fields in `widget_config`:

- `version: 2`, `goal`, `today_action`, `checked_at` (ISO date), `scope` (where and when advice applies), and `sources` with HTTPS `title`, `url`, `scope`.
- `blocks` in reading order: at least two `case` blocks, exactly one `practice` block, exactly one `check` block. One case must be a legitimate but confusing situation. All examples are synthetic unless precisely sourced and labeled otherwise.
- A `case` has `title`, `situation`, `analysis`, `legitimate` boolean.
- A `practice` has `title`, `setup`, `synthetic: true`, `steps` (3–7), `debrief`. Each step has a `prompt` and at least two `choices`. Each choice has `text`, `consequence`, `explanation`, and `recommended` boolean; exactly one is recommended per step. The learner sees a consequence, may retry that decision, moves to the next decision, sees an end debrief, and may replay the scenario. Use 3–5 meaningful steps for most lessons. This is a sequence of decisions; do not claim fully branching paths.
- A `check` has `title` and 3–5 `questions`. Each question has `prompt` and two or more `choices`; each choice has `text`, `explanation`, `correct` boolean, with exactly one correct. These test transfer rather than repeat the practice.

Use natural authored EN and RU with equivalent facts, actions and answer keys. Source links remain the same across locales; source titles/scope are localized. The server renders all blocks as a readable static fallback with decisions and explanations in disclosure controls. The browser enhances practice and checks without sending answers or user input to the server. Local lesson progress, import/export and encrypted sync keep their existing slug-based storage. Legacy `quiz`, `scenario`, `redflags`, `exam`, and `certificate` remain accepted. The final exam and local completion record use their existing widget contracts while their instructional text and assessment content are revised separately.

`backend/course_contract.py` rejects incomplete v2 lessons during local load/seed. Run backend tests, frontend tests and build, the i18n audit, and inspect both locale routes with JavaScript on and off. Never change generated assets manually.
