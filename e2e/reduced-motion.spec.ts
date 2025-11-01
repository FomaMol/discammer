import { test, expect } from '@playwright/test';

/**
 * T3.1 — reduced-motion contract. With prefers-reduced-motion: reduce, no CSS
 * animation runs infinitely, and the hero
 * canvas renders (a single static frame, not a loop). Decorative reveals snap to
 * their final state (content is present immediately).
 */

test('home honors reduced motion: no infinite animations, static hero', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/', { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // The decorative system-status label was removed from the public footer.
  await expect(page.locator('footer .status-dot')).toHaveCount(0);

  // No CSS/Web animation is running with infinite iterations.
  const infinite = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => {
          if (a.playState !== 'running') return false;
          const timing = (a.effect as KeyframeEffect | null)?.getTiming?.();
          return timing?.iterations === Infinity;
        }).length,
  );
  expect(infinite).toBe(0);

  // The hero canvas is present (HeroShader renders one frame under reduced motion).
  await expect(page.locator('canvas').first()).toBeAttached();
});
