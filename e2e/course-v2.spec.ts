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

test('a fresh learner can unmark current practice without inventing earlier completion', async ({ page }) => {
  await page.goto('/en/course/threat-fundamentals/attack-vectors');
  await page.getByRole('button', { name: 'Mark updated lesson complete' }).click();
  await page.getByRole('button', { name: 'Updated lesson complete' }).click();
  await expect(page.getByText('Your earlier lesson completion is preserved.')).toHaveCount(0);
  const state = await page.evaluate(() => ({
    legacy: JSON.parse(localStorage.getItem('discammer:progress:v1') || '{"modules":{}}'),
    revision: JSON.parse(localStorage.getItem('discammer:lesson-revisions:v1') || '{}'),
  }));
  expect(state.legacy.modules['threat-fundamentals']?.lessons?.['attack-vectors']).toBeUndefined();
  expect(state.revision['threat-fundamentals/attack-vectors@2026-10-20']).toBeUndefined();
});

test('import toast counts a newly restored current revision', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('discammer:progress:v1', JSON.stringify({
      modules: { 'threat-fundamentals': { lessons: { 'scam-economy': true } } },
    }));
  });
  await page.goto('/en/course');
  const dossier = {
    v: 2,
    exportedAt: '2026-10-20T00:00:00Z',
    lessons: { 'threat-fundamentals': { lessons: { 'scam-economy': true } } },
    lessonRevisions: { 'threat-fundamentals/scam-economy@2026-10-20': true },
    exams: null,
    certName: null,
    guideChecks: {},
  };
  const file = { name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dossier)) };
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText('// dossier merged: +1')).toBeVisible();
  await expect(page.getByText('1/55')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText('// dossier merged: +0')).toBeVisible();
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

test('revised lesson completion still requires the revised exam result', async ({ page, request }) => {
  const response = await request.get('/api/course/lesson-manifest?lang=en');
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as { module_slug: string; slug: string; content_revision: string | null }[];
  expect(manifest).toHaveLength(55);
  expect(manifest.filter((lesson) => lesson.content_revision)).toHaveLength(55);
  await page.addInitScript((lessons) => {
    const revisions = Object.fromEntries(lessons.map((lesson) => [
      `${lesson.module_slug}/${lesson.slug}@${lesson.content_revision}`, true,
    ]));
    localStorage.setItem('discammer:lesson-revisions:v1', JSON.stringify(revisions));
    localStorage.setItem('discammer:exam:v1', JSON.stringify({
      passed: true, score: 40, total: 40, passedAt: '2026-01-01T00:00:00Z',
    }));
    localStorage.setItem('discammer:certificate:name', 'Local Learner');
  }, manifest);
  await page.goto('/en/course/final-assessment/defender-certificate');
  await expect(page.locator('#discammer-certificate')).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem('discammer:exam-revisions:v1', JSON.stringify({
      '2026-10-20': { passed: true, score: 40, total: 40, passedAt: '2026-10-20T00:00:00Z' },
    }));
  });
  await page.reload();
  await expect(page.locator('#discammer-certificate')).toBeVisible();
});

for (const [lang, transmit, next] of [
  ['en', 'TRANSMIT', 'NEXT QUESTION'],
  ['ru', 'ОТПРАВИТЬ', 'СЛЕДУЮЩИЙ'],
] as const) {
  test(`${lang} exam keeps keyboard focus through answer and next question`, async ({ page }) => {
    await page.goto(`/${lang}/course/final-assessment/final-exam`);
    const widget = page.locator('[data-component="LessonWidget"]');
    await expect(widget.locator('input[type="radio"]').first()).toBeVisible();
    expect(await widget.locator('input[type="radio"]').count()).toBeGreaterThanOrEqual(3);
    await widget.locator('input[type="radio"]').first().check();
    await widget.getByRole('button', { name: new RegExp(transmit) }).click();
    const explanation = widget.getByRole('group', { name: lang === 'en' ? 'Inspect transmission log' : 'Открыть лог передачи' });
    if (await explanation.count()) {
      await expect(explanation).toBeFocused();
    } else {
      await expect(widget.getByRole('button', { name: new RegExp(next) })).toBeFocused();
    }
    await widget.getByRole('button', { name: new RegExp(next) }).click();
    await expect(widget.locator('h3[tabindex="-1"]')).toBeFocused();
  });
}

test('revised exam focuses result and restarted question after the full attempt', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/en/course/final-assessment/final-exam');
  const widget = page.locator('[data-component="LessonWidget"]');
  for (let i = 0; i < 40; i++) {
    await widget.locator('input[type="radio"]').first().check();
    await widget.getByRole('button', { name: /TRANSMIT/ }).click();
    await expect(widget.getByRole('group', { name: 'Inspect transmission log' })).toBeFocused();
    if (i < 39) {
      await widget.getByRole('button', { name: /NEXT QUESTION/ }).click();
      await expect(widget.locator('h3[tabindex="-1"]')).toBeFocused();
    }
  }
  await widget.getByRole('button', { name: /FINALIZE SELF-ASSESSMENT/ }).click();
  await expect(widget.locator('h2[tabindex="-1"]')).toBeFocused();
  await widget.getByRole('button', { name: 'Repeat self-assessment' }).click();
  await expect(widget.locator('h3[tabindex="-1"]')).toBeFocused();
});

test('exam no-JS fallback exposes question explanations on a phone', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/en/course/final-assessment/final-exam');
  const fallback = page.locator('[data-exam-fallback]');
  await expect(fallback).toBeVisible();
  await expect(fallback.locator('ol > li')).toHaveCount(40);
  await fallback.locator('summary').first().click();
  await expect(fallback.locator('details').first()).toContainText(/Correct|Incorrect/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await context.close();
});
