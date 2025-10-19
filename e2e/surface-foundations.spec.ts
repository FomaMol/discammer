import { test, expect } from '@playwright/test';

for (const lang of ['en', 'ru']) {
  test(`${lang}: journal API failure preserves reading links and offers retry`, async ({ page }) => {
    await page.route('**/api/posts?**', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(`/${lang}/journal`);
    const foundation = page.locator('#journal-foundation');
    await expect(foundation).toBeVisible();
    await expect(foundation.locator('a').first()).toBeVisible();
    const retry = page.locator('[data-component="JournalBroadsheet"] [role="status"] button');
    await expect(retry).toBeVisible();
    await page.unroute('**/api/posts?**');
    await retry.click();
    await expect(foundation).toBeHidden();
    await expect(page.locator('[data-component="JournalBroadsheet"] h2').first()).toBeVisible();
  });

  test(`${lang}: search failure is distinct from empty results and remains submittable`, async ({ page }) => {
    await page.route('**/api/search?**', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.goto(`/${lang}/search`);
    await expect(page.getByRole('combobox')).toBeVisible();
    await page.getByRole('combobox').fill('phishing');
    const status = page.locator('[data-component="SearchConsole"] [role="status"]');
    await expect(status).toContainText(lang === 'ru' ? /не удалось/i : /could not|couldn’t|unavailable|failed/i);
    await expect(page.locator('[data-component="SearchConsole"] form')).toHaveAttribute('method', 'get');
    await expect(page.getByRole('combobox')).toHaveValue('phishing');
  });

  test(`${lang}: guide contents and course navigation work without JavaScript`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`/${lang}/guide/phishing`);
    const firstSection = page.locator('#guide-toc a').first();
    await expect(firstSection).toBeVisible();
    const href = await firstSection.getAttribute('href');
    expect(href).toMatch(/^#.+/);
    await expect(page.locator(href!)).toHaveCount(1);
    await firstSection.click();
    await page.goto(`/${lang}/course/threat-fundamentals`);
    await expect(page.locator('#module-foundation a').first()).toBeVisible();
    await page.locator('#module-foundation a').first().click();
    await expect(page.locator('[data-component="LessonFooter"] a').first()).toBeVisible();
    await context.close();
  });
}

test('empty course API response preserves the SSR module list', async ({ page }) => {
  await page.route('**/api/course/modules?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/en/course');
  await expect(page.locator('[data-component="CourseProgress"]')).toContainText(/unavailable|no modules|empty/i);
  await expect(page.locator('#course-foundation')).toBeVisible();
  await expect(page.locator('#course-foundation a').first()).toBeVisible();
});
