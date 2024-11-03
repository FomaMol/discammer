# WebGPU hero — evaluation (v2 T3.2)

**Decision: DEFER. Keep the current Canvas2D / WebGL2 `HeroShader`.**

The v2 plan (`v2/claude-code/02-tasks.md`, T3.2) asked to *spike* a gated,
reduced-motion-safe WebGPU hero field and ship it **only** if it clearly beats the
existing path. It does not — yet. This records why, so the decision isn't re-litigated
from scratch.

## What the current hero already does well
`frontend/src/components/HeroShader.tsx` is a WebGL2 diagonal-dataflow field
(dim cyan/amber/red streaks, phosphor decay, <4% CRT noise, edge vignette). It:
- caps canvas opacity at **0.35** (under the DESIGN.md 0.4 chrome ceiling);
- **fully honors `prefers-reduced-motion`** — renders a single static frame, then stops;
- **pauses off-screen** via IntersectionObserver (zero CPU when not visible);
- degrades to a static CSS grid fallback when WebGL2 is absent;
- is already GPU-cheap (~2–3 draw calls, sub-millisecond on mobile).

It respects the brand: no mesh-gradient blobs, no generic particle net; colors are the
real tokens.

## Why WebGPU is deferred (not rejected)
- **Async setup vs. first paint.** WebGPU needs `await gpu.requestAdapter()/requestDevice()`,
  which doesn't fit the hero's synchronous `useEffect` setup and would delay first paint.
- **Fallback weight.** ~10–15KB of polyfill/fallback for the ~10% of visitors on Safari /
  older mobile — to replace a path that already costs near-zero.
- **Safari maturity.** WebGPU on Safari is still experimental-tier as of this writing;
  shipping before stable iOS support risks a degraded experience for a chunk of the audience.
- **Marginal payoff.** The effect is low-complexity and off-screen much of the time; the
  measured frame-time win would be <0.5ms — not a UX-visible gain to offset the complexity.

## When to revisit
Pick this back up only when **all** hold: Safari ships stable WebGPU; a lightweight,
tested WebGL2 fallback strategy exists; and a measured win justifies the async-setup cost.

## If/when it ships — the gate (do NOT default to WebGPU while Safari is experimental)
```ts
const renderHero = () =>
  (FLAGS.webgpuHero && navigator.gpu) ? <HeroShaderWebGPU/> : <HeroShader/>;
```
Behind an env flag (default off), feature-detected, with the battle-tested Canvas2D/WebGL2
path as the guaranteed fallback, and the same reduced-motion + 0.4-opacity rules applied.
