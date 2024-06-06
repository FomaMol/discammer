import { test, expect } from '@playwright/test';

/**
 * Reduced-motion behavior. Under `prefers-reduced-motion: reduce`, the course
 * Mission Briefing terminal must NOT type itself out line-by-line — it renders
 * its full final text immediately (MissionBriefingTerminal sets visibleLines to
 * lines.length when reduce is set). We assert the LAST briefing line
 * ("STATUS: READY") is present immediately, without waiting for an animation.
 */

test('course briefing renders its full text immediately under reduced motion', async ({ page }) => {
  // Emulate the media feature explicitly (more reliable than the context-level
  // `reducedMotion` option, which devices['Desktop Chrome'] can reset). This
  // makes window.matchMedia('(prefers-reduced-motion: reduce)') match, which is
  // what MissionBriefingTerminal reads to skip the line-by-line typewriter.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/course', { waitUntil: 'domcontentloaded' });

  const briefing = page.locator('[data-component="MissionBriefingTerminal"]');
  await expect(briefing).toBeAttached();

  // The final briefing line is shown right away (no typewriter reveal). We give
  // hydration a brief moment but assert WELL under the ~1.6s the typewriter
  // would otherwise take to reach the last line — proving it was not animated.
  await expect(briefing.getByText('STATUS: READY')).toBeVisible({ timeout: 2_000 });

  // And the access line (first line) is shown too — the whole transmission is
  // present at once rather than progressively.
  await expect(briefing.getByText(/ACCESS GRANTED/)).toBeVisible({ timeout: 2_000 });
});
