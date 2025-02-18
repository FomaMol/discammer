import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility — axe-core scan. Each page must have ZERO STRUCTURAL violations
 * of impact `serious` or `critical` (missing names/labels/roles, bad ARIA, etc).
 * On failure we surface the violation array so the harness is a usable debug
 * tool, not just a red light.
 *
 * `color-contrast` is now ENFORCED by the gate. The DiScammer canvas is
 * `#0b0f1a`; the previously low-contrast muted greys (#475064 / #6b7588) failed
 * WCAG AA and were lifted to `#8b94a8` in A2 (≥4.5:1 body contrast on every
 * canvas surface, including the worst case `#1e2740` input). `#6b7588` survives
 * only as the new non-text `--color-ink-dim` token for decorative glyphs/hairlines
 * (≥3:1). With the palette fixed there is no longer a contrast-debt carve-out, so
 * the gate blocks on contrast regressions alongside structural a11y violations.
 */

// UX-3 (WCAG 2.2 AA): coverage extended beyond the original key pages to a post,
// a threat guide, a course module, a lesson, the game, and the about page so the
// gate scans every server-rendered surface type, not just the landing set.
const A11Y_PAGES = [
  '/en/',
  '/ru/',
  '/en/course',
  '/en/course/threat-fundamentals',
  '/en/course/threat-fundamentals/attack-vectors',
  '/en/journal',
  '/en/journal/blockchain',
  '/en/guide/phishing',
  '/en/game',
  '/en/about',
  '/en/check',
  '/en/inspect',
  '/en/search',
];

// Rules excluded from the blocking gate (none — contrast is now enforced, see header note).
const EXCLUDED_RULES = new Set<string>([]);

for (const path of A11Y_PAGES) {
  test(`a11y: ${path} has no serious/critical structural axe violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    // Allow islands to hydrate so axe scans the live DOM.
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page })
      // wcag22aa adds WCAG 2.2 success criteria; target-size (2.5.8, 24x24 CSS
      // px pointer targets) is enabled explicitly since axe ships it outside the
      // default tag set.
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .options({ rules: { 'target-size': { enabled: true } } })
      // The guide's `.dossier-gutter` is a purely decorative, aria-hidden
      // line-number flourish (fake ordinals, not real article lines). WCAG 1.4.3
      // exempts pure decoration from the text-contrast requirement, and the design
      // system's decorative-glyph tier is deliberately sub-4.5:1 (see this repo's
      // --color-ink-dim note). axe can't infer decorative intent, so it is
      // excluded here rather than lit up to body-text brightness.
      .exclude('.dossier-gutter')
      .analyze();

    const blocking = results.violations.filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') && !EXCLUDED_RULES.has(v.id),
    );

    const report = blocking
      .map(
        (v) =>
          `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n    ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 5)
            .join('\n    ')}`,
      )
      .join('\n');

    expect(blocking, `serious/critical a11y violations on ${path}:\n${report}`).toEqual([]);
  });
}
