# Project instructions — DiScammer

## Brand is locked to DiScammer's own design system (NOT Cadence)
This project's authoritative visual system is **DiScammer** as defined in `uploads/DESIGN.md`,
`uploads/PRODUCT.md`, and `uploads/deslop-handoff.md`, evolved in `discammer-v2/00-DESIGN-SYSTEM-v2.md`:
- Cool-dark analyst-console canvas (`#0b0f1a`), single cyan accent `#65def0`, semantic amber/green/red.
- JetBrains Mono (data/voice) + Geist (reading). No Inter, no pixel font.
- v1 is on production; v2 ("Field Office") is the second iteration.

A **Cadence Design System** skill may be bound to this project. Cadence is an unrelated indigo/Onest
planner for AuDHD users; its own scope note says its guide "may describe products unrelated to the
subject." **Do not apply Cadence styling to DiScammer and do not load its bundle.** The design-system
adherence warning about the un-loaded Cadence bundle is expected and intentional — ignore it.

## Active deliverables
- `DiScammer v2.dc.html` — the v2 redesign (current).
- `DiScammer Redesign.dc.html` — v1 (matches prod).
- `Logo Explorations.dc.html` — logo system.
- `discammer-v2/` — DS v2 spec, the two design reviews, and the Claude Code multi-agent handoff.

## Animation note (load-bearing)
Entrance reveals must never hide content behind JS-toggled opacity — the runtime re-renders and can
strand nodes at `opacity:0`. Keep content visible by default; animate only with effects that cannot
hide content (canvas ambient, ticker, meter-fill, glitch-once, hover/press).
