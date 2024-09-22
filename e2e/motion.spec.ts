import { test, expect } from '@playwright/test';

/**
 * Reduced-motion behavior. The editorial redesign made the course hero static
 * SSR (the old MissionBriefingTerminal line-by-line typewriter was replaced by a
 * static `syllabus.json` terminal). So under `prefers-reduced-motion: reduce` the
 * whole transmission is present at once with no animation gating: we assert the
 * static terminal + the CourseProgress island are there immediately. globals.css
 * carries the broader reduced-motion contract for the remaining CSS animations.
 */

test('course renders its full content immediately under reduced motion', async ({ page }) => {
  // Emulate the media feature explicitly (more reliable than the context-level
  // `reducedMotion` option, which devices['Desktop Chrome'] can reset).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/course', { waitUntil: 'domcontentloaded' });

  // The static syllabus terminal filename is rendered server-side — visible at
  // once, never typed out.
  await expect(page.getByText('syllabus.json')).toBeVisible({ timeout: 2_000 });

  // The interactive module list (CourseProgress) is present — the page is whole,
  // not waiting on any reveal animation.
  await expect(page.locator('[data-component="CourseProgress"]')).toBeAttached();
});
