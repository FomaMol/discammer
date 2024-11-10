import { test, expect } from '@playwright/test';

/**
 * T1.3 — the design-review-only A/B "rhythm" switcher must NOT exist in prod. The
 * served HTML carries no rhythm/variant/experiment control on any page. (The
 * EN|RU toggle is a localization switch, not an A/B control, and is allowed.)
 */

const AB_MARKERS =
  /\bRHYTHM\b|data-(variant|experiment|ab|abtest|rhythm|split)\b|__EXPERIMENT__|__AB__|getVariant\(/i;

const PAGES = ['/en/', '/en/guide/phishing', '/en/course', '/en/inspect', '/en/check', '/ru/'];

for (const path of PAGES) {
  test(`${path}: no A/B / rhythm switcher in served HTML`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    expect(html, `A/B marker found on ${path}`).not.toMatch(AB_MARKERS);
    const ctrl = await page
      .locator('[data-variant],[data-experiment],[data-ab],[data-rhythm]')
      .count();
    expect(ctrl, `experiment data-attr present on ${path}`).toBe(0);
  });
}
