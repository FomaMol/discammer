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

const A11Y_PAGES = ['/en/', '/en/course', '/en/check', '/en/inspect', '/en/search', '/en/journal', '/ru/'];

// Rules excluded from the blocking gate (none — contrast is now enforced, see header note).
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
