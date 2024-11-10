import { test, expect } from '@playwright/test';

/**
 * T1.2 — the "Three ways in" clarity band on home: Learn / Check / Practice, each
 * a real <a> with a >=44px hit area, keyboard-reachable in DOM order, with the
 * global cyan focus-visible ring.
 */

const SECTION = 'section[aria-label="Three ways to use DiScammer"]';
const LINKS = ['/en/course', '/en/check', '/en/game'];

test('three real links, each >=44px, present in order', async ({ page }) => {
  await page.goto('/en/');
  const section = page.locator(SECTION);
  await expect(section).toBeVisible();
  await expect(section.locator('a')).toHaveCount(3);

  for (const href of LINKS) {
    const link = section.locator(`a[href="${href}"]`);
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width, `${href} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${href} height`).toBeGreaterThanOrEqual(44);
  }
});

test('links are keyboard-reachable in DOM order', async ({ page }) => {
  await page.goto('/en/');
  const section = page.locator(SECTION);

  const course = section.locator('a[href="/en/course"]');
  const check = section.locator('a[href="/en/check"]');
  const game = section.locator('a[href="/en/game"]');

  await course.focus();
  await expect(course).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(check).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(game).toBeFocused();

  // The visible focus ring is the universal `*:focus-visible` cyan outline,
  // verified exactly (2px, rgb(101,222,240)) in focus-skiplink.spec.ts — it
  // applies to every focusable element, so it is not re-measured per-component
  // here (the :focus-visible modality timing makes a per-element read flaky).
});
