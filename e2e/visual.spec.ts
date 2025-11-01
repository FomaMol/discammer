import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Visual regression sweep (Task Q1).
 *
 * Full-page `toHaveScreenshot` captures for the key surfaces × RU/EN. The
 * desktop/mobile axis is driven by the two PROJECTS in visual.config.ts (each
 * project pins its own viewport + deviceScaleFactor), so each test here runs
 * once per project — the snapshot filename is suffixed with the project name and
 * the OS (e.g. `home-en-desktop-darwin.png`).
 *
 * MASKING: the hero typewriter line and the terminal both animate via JS
 * timers (text mutates every 40–180ms), so a capture lands on an arbitrary
 * animation phase and would flake. We mask those island roots by their
 * `[data-component]` selector. CSS animations (the blink caret, etc.) are
 * additionally frozen by `animations: 'disabled'` in the config. There are no
 * rendered wall-clock timestamps on these pages, but if any are added, extend
 * `dynamicMasks` below.
 *
 * PLATFORM: this run is chromium-only and must be invoked with its dedicated
 * config: `npx playwright test visual.spec.ts -c visual.config.ts`. Snapshots
 * are committed per-OS; the LINUX baselines are CI-seeded (see the config header
 * and docs/deploy/visual-regression.md).
 */

// Guard: visual.spec.ts must run ONLY under visual.config.ts. If the main
// playwright.config.ts (testMatch '*.spec.ts') ever picks it up, skip rather
// than fail against non-existent linux/main-config baselines.
test.skip(
  !process.env.PW_VISUAL,
  'visual.spec.ts runs only under visual.config.ts (sets PW_VISUAL); skipped under the default config.',
);

type Surface = { slug: string; pathFor: (lang: 'en' | 'ru') => string };

// Key surfaces. Real slugs per the Q1 contract: post the-story-of-alex-chen,
// guide phishing. 404 is exercised via a deliberately-missing path.
const SURFACES: Surface[] = [
  { slug: 'home', pathFor: (l) => `/${l}/` },
  { slug: 'journal', pathFor: (l) => `/${l}/journal` },
  { slug: 'post', pathFor: (l) => `/${l}/journal/the-story-of-alex-chen` },
  { slug: 'guide', pathFor: (l) => `/${l}/guide/phishing` },
  { slug: 'course', pathFor: (l) => `/${l}/course` },
  { slug: 'game', pathFor: (l) => `/${l}/game` },
  { slug: 'about', pathFor: (l) => `/${l}/about` },
  { slug: 'search', pathFor: (l) => `/${l}/search` },
  { slug: 'check', pathFor: (l) => `/${l}/check` },
  { slug: 'inspect', pathFor: (l) => `/${l}/inspect` },
  { slug: '404', pathFor: (l) => `/${l}/__visual_regression_missing__` },
];

const LANGS: Array<'en' | 'ru'> = ['en', 'ru'];

/**
 * Locators for known-dynamic regions to MASK.
 *
 * Two classes of nondeterminism on these pages:
 *   1. JS-animated / canvas islands whose pixels change frame-to-frame. The
 *      hero typewriter + terminal mutate text on 40–180ms timers; HeroShader is
 *      a requestAnimationFrame canvas (CSS `animations: disabled` does NOT
 *      freeze rAF); WordmarkReveal plays a one-shot reveal; SimulateTerminal is
 *      another timer-driven console. We mask these island roots by their
 *      `[data-component]` selector (values are unique per page).
 *   2. Server-rendered wall-clock timestamps. home.html stamps the current
 *      `{hour}:{minute} UTC` in the HUD strip and the situation-report header,
 *      so a baseline captured at :07 differs from a run at :08. We mask the
 *      spans whose text ends in "UTC". These are decorative (aria-hidden /
 *      mono chrome) — masking them removes the only time-varying pixels without
 *      hiding content the snapshot is meant to guard.
 *
 * Locators that match nothing on a given page are simply no-ops for the mask.
 */
function dynamicMasks(page: Page): Locator[] {
  return [
    page.locator('[data-component="HeroTypewriter"]'),
    page.locator('[data-component="HeroTerminal"]'),
    page.locator('[data-component="HeroShader"]'),
    page.locator('[data-component="WordmarkReveal"]'),
    page.locator('[data-component="SimulateTerminal"]'),
    // Wall-clock timestamp spans (HUD strip + situation-report header).
    page.locator('span', { hasText: /\d{2}:\d{2}\s*UTC/ }),
  ];
}

for (const surface of SURFACES) {
  for (const lang of LANGS) {
    const path = surface.pathFor(lang);
    test(`visual: ${surface.slug} ${lang} (${path})`, async ({ page }) => {
      const resp = await page.goto(path, { waitUntil: 'networkidle' });
      expect(resp, `no response for ${path}`).toBeTruthy();
      // 404 surface renders the branded template with status 404; everything
      // else is 200. Assert so a routing regression is caught here too.
      const expectedStatus = surface.slug === '404' ? 404 : 200;
      expect(resp!.status(), `status for ${path}`).toBe(expectedStatus);

      // Let islands hydrate + lazy chunks settle so the captured DOM is final.
      await page.waitForTimeout(800);
      // Never approve an unstyled response as a new visual baseline.
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 19, 20)');

      await expect(page).toHaveScreenshot(`${surface.slug}-${lang}.png`, {
        fullPage: true,
        mask: dynamicMasks(page),
      });
    });
  }
}
