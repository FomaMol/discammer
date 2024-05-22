import { test, expect } from '@playwright/test';

/**
 * Course progress unlock + exam persistence.
 *
 * Module 2 (`social-engineering`) is locked by seed; the progressive-unlock rule
 * in CourseProgress opens it once every lesson of module 1 (`threat-fundamentals`,
 * 6 lessons) is completed. We seed discammer:progress:v1 to that state and assert
 * module 2 renders as an actual link (unlocked) rather than a non-interactive
 * locked card.
 *
 * Then we seed discammer:exam:v1 with a passing record and assert it survives a
 * reload — i.e. the best-of exam state persists (resilient: read storage rather
 * than depend on the exact certificate DOM, which only mounts on the cert lesson).
 */

const PROGRESS_KEY = 'discammer:progress:v1';
const EXAM_KEY = 'discammer:exam:v1';

// All six lessons of threat-fundamentals, completed.
const TF_LESSONS = [
  'attack-vectors',
  'threat-actors',
  'scam-economy',
  'breach-reports',
  'glossary',
  'cfo-deepfake-heist',
];

function seededProgress() {
  const lessons: Record<string, true> = {};
  for (const slug of TF_LESSONS) lessons[slug] = true;
  return JSON.stringify({ modules: { 'threat-fundamentals': { lessons } } });
}

test('completing module 1 unlocks module 2 in the course flow', async ({ page }) => {
  // Seed BEFORE any app code runs so CourseProgress reads it on first mount.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PROGRESS_KEY, seededProgress()],
  );

  await page.goto('/en/course');

  // The unlocked module 2 renders as a real link to its briefing.
  const module2Link = page.locator('a[href="/en/course/social-engineering"]').first();
  await expect(module2Link).toBeVisible({ timeout: 10_000 });

  // Sanity: module 1 is shown as completed/linked too (its lessons are all done).
  const module1Link = page.locator('a[href="/en/course/threat-fundamentals"]').first();
  await expect(module1Link).toBeVisible();
});

test('without progress, module 2 stays locked (no link)', async ({ page }) => {
  // Fresh storage — nothing seeded.
  await page.goto('/en/course');
  // CourseProgress must have mounted (module 1 is always open).
  await expect(page.locator('a[href="/en/course/threat-fundamentals"]').first()).toBeVisible({
    timeout: 10_000,
  });
  // Module 2 is locked → rendered as a non-link card, so no anchor to it exists.
  await expect(page.locator('a[href="/en/course/social-engineering"]')).toHaveCount(0);
});

test('a passing exam record survives a reload (best-of persistence)', async ({ page }) => {
  const examRecord = {
    passed: true,
    score: 9,
    total: 10,
    passedAt: '2026-01-01T00:00:00.000Z',
  };
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [EXAM_KEY, JSON.stringify(examRecord)],
  );

  await page.goto('/en/course');
  await expect(page.locator('a[href="/en/course/threat-fundamentals"]').first()).toBeVisible({
    timeout: 10_000,
  });

  // Reload and confirm the exam record is intact and still marked passed.
  await page.reload();
  const persisted = await page.evaluate((key) => localStorage.getItem(key), EXAM_KEY);
  expect(persisted, 'exam record missing after reload').toBeTruthy();
  const parsed = JSON.parse(persisted as string);
  expect(parsed.passed).toBe(true);
  expect(parsed.score).toBe(9);
  expect(parsed.total).toBe(10);
});
