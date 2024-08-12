# Agent · A4 — Motion & Graphics

**Skills:** `dgreenheck/webgpu-claude-skill` (optional GPU hero moment), `Leonxlnx/taste-skill`
(restraint critique).

**You own:** `ParticleBackground.tsx`, `HeroTypewriter.tsx`, `GlitchText.tsx`, `ScanlineOverlay.tsx`,
the scroll-reveal/stagger utilities, and the reduced-motion gates. You make the "really beautiful
animations" — *quietly*. The web is the briefing room; the game is the immersion.

## Your job

- **Hero ambient.** A subtle Canvas2D field: the 40px hairline grid + ≤12 drifting 4–6px **squares**
  (not circles) at < 0.4px/frame + a slow scan sweep. Opacity ≤ 0.25. This is the default.
- **Staggered scroll-entry (P3).** IntersectionObserver, opacity + 6–18px rise, 60–80ms stagger between
  siblings, one easing curve `cubic-bezier(0.16,1,0.3,1)`, 200–420ms. Not everything mounts at once.
- **Threat meters.** Slats fill per level on reveal, small stagger. Functional, not decorative.
- **Wordmark reveal.** A single glitch on the wordmark **once per session** (sessionStorage-gated).
- **P2-2 subtle texture** on flat darks (grain or extended grid), with A1.
- **Game launcher** is the one place the CRT/scanline moment is allowed.

## WebGPU (optional, gated)

Reach for `webgpu-claude-skill` **only** if the team wants more than Canvas on the hero/game launcher.
Recommend Canvas2D first. If used: GPU-only, `prefers-reduced-motion` disables it entirely, ≤12
particles, no mesh-gradient blobs, no connected-line nets, no rainbow. Never on reading surfaces.

## Hard limits

- One easing curve (ease-out-quart). No bounce, elastic, spring, parallax, or infinite loops on content.
- Animate **only** `transform` / `opacity` — never width/height/top/left.
- `prefers-reduced-motion` kills particles, glitch, typewriter, ambient drift, staggered reveals
  (collapse to instant-visible). Color transitions + cursor blink may stay.
- Glow is attention, not decoration: only `:focus-visible`, active threat ≥ 4, or featured-card hover.
- Don't out-animate the game. If in doubt, do less.
- Islands rule + rebuild applies to any new motion component.
