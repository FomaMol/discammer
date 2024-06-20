import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility — axe-core scan. Each page must have ZERO violations of impact
 * `serious` or `critical` — including `color-contrast`. (The muted-grey palette
 * was lifted to WCAG AA in v5, so contrast is now part of the gate and future
 * regressions are caught.) On failure we surface the violation array so the
 * harness is a usable debug tool, not just a red light.
 */

const A11Y_PAGES = ['/en/', '/en/course', '/en/check', '/en/search', '/ru/'];

// No rules excluded — contrast is enforced as of v5.
const EXCLUDED_RULES = new Set<string>([]);

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
