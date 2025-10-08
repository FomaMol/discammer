# DiScammer Field Office · September 2026

The existing site is the visual foundation: expressive JetBrains Mono headings, Geist reading text, the asymmetric home/checker composition, varied editorial rhythm and useful instrument-like borders. A visitor reads to learn or arrives with a suspicious message. Preserve a calm, legible dark interface and one concrete next action.

## Two chosen themes

Default **soft-red**, alternative **graphite-silver**. One layout, runtime semantic roles. The supplied Unity game, its resources and unfiltered screenshots are outside the theme system. No amber theme, light landing-page replacement or rejected copper mockups.

```css
:root, html[data-theme="soft-red"] {
  --canvas: #151314;
  --panel: #211e1f;
  --raised: #2e292a;
  --input: #383032;
  --border: #393032;
  --border-strong: #887476;
  --text: #ede5e3;
  --text-strong: #f7f0ec;
  --text-medium: #dccdca;
  --text-soft: #c4b3af;
  --text-soft2: #cbbcb7;
  --muted: #b6a29d;
  --dim: #97837e;
  --brand: #f29587;
  --brand-hover: #ffb5a6;
  --brand-dim: #c88578;
  --success: #7ce896;
  --warning: #f4b965;
  --danger: #ff8995;
  --threat-mid: #f29b6c;
  --code: #100e0f;
  --focus: var(--brand);
  color-scheme: dark;
}
html[data-theme="graphite-silver"] {
  --canvas: #101314;
  --panel: #181d1e;
  --raised: #232a2b;
  --input: #2c3435;
  --border: #2a3233;
  --border-strong: #718681;
  --text: #e4e9e8;
  --text-strong: #f1f4f2;
  --text-medium: #cdd5d3;
  --text-soft: #b1bcb9;
  --text-soft2: #bdc6c3;
  --muted: #a2b0ac;
  --dim: #82938e;
  --brand: #dce8df;
  --brand-hover: #f1f5ec;
  --brand-dim: #8eab99;
  --success: #7ce896;
  --warning: #f4b965;
  --danger: #ff8995;
  --threat-mid: #f29b6c;
  --code: #0c1011;
  --focus: var(--brand);
  color-scheme: dark;
}


```

Text contrast is at least 4.5:1 on canvas, panel, raised, input and code. Required control boundaries and focus meet 3:1. `border` is decorative separation; use `border-strong` for editable fields and necessary control outlines. Brand is an ordinary action. Warning and danger always pair color with a label/icon or meter; absence of detected signals is not proof of safety.

The compatibility names `--color-cyan*`, `--color-ink*`, `--color-bg-*` and existing utility classes resolve to these roles only. They are deprecated for new work; remove each alias as its last consumer is migrated. They are not a second palette. Inline/JS colors use roles, with computed values for exported canvas images and GLSL uniforms.

## Type, layout and controls

Keep self-hosted JetBrains Mono and Geist, including Cyrillic. Display uses mono 800 and the existing expressive scale; long-form uses Geist 17–18px / 1.7 and at most 68ch. Working inputs are at least 16px, helper copy 13–14px, metadata 12–13px. Preserve full lesson names by wrapping. Navigation controls target 44px; desktop navigation starts at 1280px so RU labels fit. Below that use the existing menu with inline appearance choices.

Appearance is a neutral 44px icon next to language, with a compact two-radio popover and focus tooltip. Escape returns focus; mobile Escape closes appearance before navigation. Store only allowlisted theme values in localStorage, separately from learning progress, tolerate denied storage, sync tabs, update theme-color. The nonce-bearing prepaint bootstrap applies selection before CSS. JS-off uses default soft-red with native navigation and readable SSR; failed chunks retain the same foundation.

## Surfaces and motion

Keep the real home checker, factual content counters, lead + supporting interviews, dated newsletter list, varied journal, threat catalogue and course route. Label educational examples honestly. Use the supplied game's real screenshot on Game, load Unity only after explicit launch. The site modal portals above navigation, closes via button or Escape inside canvas, removes iframe and restores focus.

Course progress/import/export/encrypted sync remain local-first and unchanged. No invented credentials, biography, experts, publication promises or measured outcomes. Preserve authored content and provenance. Journal/search distinguish loading, empty and error. Guide TOC is real SSR headings on mobile and desktop. Static support remains available until enhancement succeeds.

Keep the restrained shader at 0.2 opacity, pause off-screen and respect reduced motion. No new scroll frameworks, parallax, glass navigation, or color filters over media/game. Completion print is a neutral legible document; exports use selected site colors. Favicon/manifest/OG use the default brand.

Historical system: [DESIGN-before.md](docs/design/2026-09-implementation/DESIGN-before.md). Requirements and route/state acceptance: [September implementation plan](DISCAMMER_REDESIGN_PLAN_2026-09.md).
