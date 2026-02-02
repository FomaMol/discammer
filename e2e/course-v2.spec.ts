import { test, expect } from '@playwright/test';

test('lookalike pilot has consequential decisions, retry and a complete debrief', async ({ page }) => {
  await page.goto('/en/course/phishing/lookalike-domains');
  await expect(page.locator('[data-course-version="2"]')).toBeVisible();
  await page.getByRole('button', { name: 'The visible bank words prove the link belongs to the bank.' }).click();
  await expect(page.getByRole('status').first()).toContainText('unverified site');
  await expect(page.getByRole('status').first()).toBeFocused();
  await page.getByRole('button', { name: 'Try this decision again' }).click();
  await page.getByRole('button', { name: 'The host ends in example.net; the bank words alone prove nothing.' }).click();
  await expect(page.getByRole('status').first()).toContainText('pause before opening');
  await page.getByRole('button', { name: 'Next decision' }).click();
  await expect(page.getByRole('heading', { name: 'A second link is https://login.harborbank.co.uk/account. Which domain-reading claim is sound?' })).toBeFocused();
  await page.getByRole('button', { name: 'The registrable part is harborbank.co.uk, but that alone does not validate the request.' }).click();
  await page.getByRole('button', { name: 'Next decision' }).click();
  await page.getByRole('button', { name: 'Open the bank app from your home screen and check delivery or contact support there.' }).click();
  await page.getByRole('button', { name: 'Next decision' }).click();
  await page.getByRole('button', { name: 'Use the real app or known website to change the password, review sessions/MFA, and contact support.' }).click();
  await page.getByRole('button', { name: 'View debrief' }).click();
  await expect(page.getByRole('heading', { name: 'Debrief' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Debrief' })).toBeFocused();
  await expect(page.locator('[data-course-version="2"] ol').first().locator('li')).toHaveCount(4);
  await page.getByRole('button', { name: 'Restart scenario' }).click();
  await expect(page.getByRole('heading', { name: 'The message displays https://harborbank.co.uk.card-status.example.net/confirm. What do you conclude from the address?' })).toBeFocused();
  await page.getByRole('button', { name: 'The visible bank words prove the link belongs to the bank.' }).click();
  await page.getByRole('button', { name: 'Next decision' }).click();
  await expect(page.getByRole('heading', { name: 'You opened the page and see a polished bank logo, but have entered nothing. What now?' })).toBeFocused();
  await page.getByRole('button', { name: 'Close the tab and open the bank app independently.' }).click();
  await page.getByRole('button', { name: 'Next decision' }).click();
  await expect(page.getByRole('heading', { name: 'A second link is https://login.harborbank.co.uk/account. Which domain-reading claim is sound?' })).toBeFocused();
  await page.getByRole('button', { name: 'The registrable part must be co.uk.' }).click();
  await page.getByRole('button', { name: 'Try this question again' }).first().click();
  await expect(page.getByRole('heading', { name: '1. In https://help.example.co.uk/login, what does the co.uk example show?' })).toBeFocused();
});

test('Russian no-JS fallback is readable on a phone and exposes consequences', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/ru/course/phishing/lookalike-domains');
  const fallback = page.locator('[data-course-fallback="2"]');
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('heading', { name: 'Цель урока' })).toBeVisible();
  await expect(fallback.getByRole('heading', { name: 'Разбор' })).toBeVisible();
  const first = fallback.locator('details').first();
  await first.locator('summary').click();
  await expect(first).toContainText('Вы готовы ввести пароль');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await context.close();
});

test('earlier completion remains separate from the revised lesson', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('discammer:progress:v1', JSON.stringify({
      modules: { phishing: { lessons: { 'lookalike-domains': true } } },
    }));
  });
  await page.goto('/en/course/phishing/lookalike-domains');
  await expect(page.getByText('Your earlier lesson completion is preserved.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark updated lesson complete' }).click();
  await expect(page.getByRole('button', { name: 'Updated lesson complete' })).toBeVisible();
  const state = await page.evaluate(() => ({
    old: JSON.parse(localStorage.getItem('discammer:progress:v1') || '{}'),
    revised: JSON.parse(localStorage.getItem('discammer:lesson-revisions:v1') || '{}'),
  }));
  expect(state.old.modules.phishing.lessons['lookalike-domains']).toBe(true);
  expect(state.revised['phishing/lookalike-domains@2026-10-20']).toBe(true);
});

test('old completion does not mark the revised lesson or course overview complete', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('discammer:progress:v1', JSON.stringify({
      modules: { phishing: { lessons: { 'lookalike-domains': true } } },
    }));
  });
  await page.goto('/en/course/phishing');
  const lesson = page.locator('a[href="/en/course/phishing/lookalike-domains"]').first();
  await expect(lesson).toBeVisible();
  await expect(lesson).toContainText('[ ]');
  await page.goto('/en/course');
  await expect(page.getByText('0/55')).toBeVisible();
});

test('earlier lesson and exam records cannot issue the current completion record', async ({ page, request }) => {
  const manifestResponse = await request.get('/api/course/lesson-manifest?lang=en');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as { module_slug: string; slug: string }[];
  const modules: Record<string, { lessons: Record<string, true> }> = {};
  for (const lesson of manifest) {
    modules[lesson.module_slug] ??= { lessons: {} };
    modules[lesson.module_slug].lessons[lesson.slug] = true;
  }
  await page.addInitScript((legacy) => {
    localStorage.setItem('discammer:progress:v1', JSON.stringify({ modules: legacy }));
    localStorage.setItem('discammer:exam:v1', JSON.stringify({
      passed: true, score: 36, total: 40, passedAt: '2026-01-01T00:00:00Z',
    }));
    localStorage.setItem('discammer:certificate:name', 'Old local name');
  }, modules);
  await page.goto('/en/course/final-assessment/defender-certificate');
  await expect(page.locator('#discammer-certificate')).toHaveCount(0);
});
