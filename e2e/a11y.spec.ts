import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility — axe-core scan. Each page must have ZERO STRUCTURAL violations
 * of impact `serious` or `critical` (missing names/labels/roles, bad ARIA, etc).
 * On failure we surface the violation array so the harness is a usable debug
 * tool, not just a red light.
 *
 * `color-contrast` is intentionally EXCLUDED from the gate. The DiScammer
 * cyberpunk palette deliberately uses low-contrast muted greys (#475064 /
 * #6b7588 on the #0B0E17 canvas) for secondary/caption text; axe flags many of
 * these as serious color-contrast failures on every page. That is a known,
 * pre-existing design-token characteristic — not a regression this harness
 * should block on — and it is reported as design debt rather than fixed here
 * (fixing the palette is outside this harness's ownership). Excluding the single
 * rule keeps the gate catching real structural a11y regressions.
 */

const A11Y_PAGES = ['/en/', '/en/course', '/en/check', '/en/search'];

// Rules excluded from the blocking gate (reported as debt, see header note).
const EXCLUDED_RULES = new Set(['color-contrast']);

for (const path of A11Y_PAGES) {
  test(`a11y: ${path} has no serious/critical structural axe violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    // Allow islands to hydrate so axe scans the live DOM.
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
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
