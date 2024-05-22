import { test, expect } from '@playwright/test';

/**
 * Navigation aria-current correctness. base.html marks the active section's nav
 * link with aria-current ("page" on an exact match). The desktop nav contains
 * COURSE, JOURNAL, CHECK, SEARCH, and PLAY links.
 */

// Scope to the top <nav> so footer links (which repeat hrefs) don't match.
function navLink(page: import('@playwright/test').Page, href: string) {
  return page.locator(`nav a[href="${href}"]`).first();
}

test.describe('nav: aria-current reflects the active section', () => {
  test('nav exposes CHECK and SEARCH links', async ({ page }) => {
    await page.goto('/en/');
    await expect(navLink(page, '/en/check')).toBeVisible();
    await expect(navLink(page, '/en/search')).toBeVisible();
    await expect(navLink(page, '/en/course')).toBeVisible();
  });

  test('/en/course → COURSE link is aria-current', async ({ page }) => {
    await page.goto('/en/course');
    await expect(navLink(page, '/en/course')).toHaveAttribute('aria-current', /page|true/);
    // A sibling that is NOT the active section must not be current.
    await expect(navLink(page, '/en/check')).not.toHaveAttribute('aria-current', /.+/);
  });

  test('/en/check → CHECK link is aria-current', async ({ page }) => {
    await page.goto('/en/check');
    await expect(navLink(page, '/en/check')).toHaveAttribute('aria-current', /page|true/);
    await expect(navLink(page, '/en/search')).not.toHaveAttribute('aria-current', /.+/);
  });

  test('/en/search → SEARCH link is aria-current', async ({ page }) => {
    await page.goto('/en/search');
    await expect(navLink(page, '/en/search')).toHaveAttribute('aria-current', /page|true/);
    await expect(navLink(page, '/en/course')).not.toHaveAttribute('aria-current', /.+/);
  });
});
