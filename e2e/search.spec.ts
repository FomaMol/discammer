import { test, expect } from '@playwright/test';

/**
 * Search island (/{lang}/search). Typing a query hits /api/search, renders
 * result cards with <mark>-highlighted snippets, and a result links to the
 * matching guide. The seeded guide slug `phishing` is the anchor.
 */

test('typing "phishing" yields a highlighted result linking to the phishing guide', async ({
  page,
}) => {
  await page.goto('/en/search');

  // The island upgrades the SSR form; type into the search input.
  const input = page.locator('input[type="search"]');
  await expect(input).toBeVisible();
  await input.fill('phishing');

  // Results appear after the debounced /api/search fetch resolves. The guide
  // result links to /en/guide/phishing.
  // Scope to the dynamic listbox. The shared footer also links to this guide,
  // so an unscoped href would not prove the debounced search rendered a result.
  const guideLink = page.locator('[role="listbox"] a[href="/en/guide/phishing"]');
  await expect(guideLink).toBeVisible({ timeout: 10_000 });

  // A <mark> highlight is present in the rendered results.
  await expect(guideLink.locator('mark')).toBeVisible();

  // Clicking the result navigates to the guide page.
  await guideLink.click();
  await page.waitForURL('**/en/guide/phishing');
  expect(page.url()).toContain('/en/guide/phishing');
});
