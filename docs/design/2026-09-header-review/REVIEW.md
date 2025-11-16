# Header and interface review · 2026-09-10

Owner requested language-switch and appearance-menu corrections, plus a general design review. Retained the existing two palettes, page compositions, JetBrains Mono / Geist pair and untouched vendor game.

Fixed: unified EN / RU order and active underline across header/mobile/footer; removed oversized boxed header controls; aligned appearance typography to navigation, reduced panel width, removed duplicate outline and tooltip overlap; kept native radio semantics and forced-colors fallback. Increased inspector helper and severity-label sizes. Removed five empty icon-font placeholders from site templates.

Independent source/evidence audit and final diff review found no confirmed unresolved defect. Existing broad page layouts remain coherent and do not warrant another redesign. Verified RU inspector results and expanded mobile menu at 320px with no document overflow, plus open appearance menus in both locales/themes at 1440px. Existing keyboard, persistence, no-JS and failed-chunk tests pass.

Validation: backend 285, frontend 199, browser 132 passing (45 opt-in/environment skips). Updated intentional Darwin visual baselines and compared again before release. Linux visual baseline seeding remains an existing CI limitation. Deployment evidence is the main CI run and live health SHA.

Unrelated existing production issue: Cloudflare overrides the new game's no-cache header. Its separately proposed infrastructure change remains pending; no Cloudflare changes are part of this release.
