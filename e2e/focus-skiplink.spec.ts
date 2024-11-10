import { test, expect } from '@playwright/test';

/**
 * T1.4 — global focus + skip link. The skip-to-content link is the first tab stop
 * (hidden until focused), and the global *:focus-visible rule paints a 2px cyan
 * (#65def0 = rgb(101,222,240)) ring on keyboard focus.
 */

test('skip link is the first tab stop and reveals on focus', async ({ page }) => {
  await page.goto('/en/');
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip).toBeAttached();
  // sr-only collapses to a ~1px clipped box until focused (Playwright still calls
  // a 1px element "visible", so assert the collapsed size, not visibility).
  const hidden = await skip.boundingBox();
  expect(hidden!.width).toBeLessThan(5);

  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  // On focus it becomes a real, full-size button.
  const shown = await skip.boundingBox();
  expect(shown!.width).toBeGreaterThan(40);
});

test('keyboard focus paints the 2px cyan focus-visible ring', async ({ page }) => {
  await page.goto('/en/');
  await page.keyboard.press('Tab'); // focus skip link via keyboard -> :focus-visible
  const skip = page.locator('a[href="#main-content"]');
  await expect(skip).toBeFocused();

  const ring = await skip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
  });
  expect(ring.width).toBe('2px');
  expect(ring.style).toBe('solid');
  expect(ring.color).toBe('rgb(101, 222, 240)');
});
