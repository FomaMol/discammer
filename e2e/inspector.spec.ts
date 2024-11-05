import { test, expect } from '@playwright/test';
import { assertNoNetworkLeak } from './helpers';

/**
 * LinkInspector (/{lang}/inspect). A pure, in-browser URL inspector — the link is
 * never fetched, opened, or sent anywhere; inspection runs only on explicit
 * submit. Asserts: a lookalike domain / raw-IP / userinfo "@" trick each fire a
 * finding with an elevated meter, a clean URL gets the softened "not a guarantee"
 * copy (no false reassurance), and the page never navigates to the pasted link.
 */

const INSPECTOR = '[data-component="LinkInspector"]';

async function inspect(page: import('@playwright/test').Page, url: string) {
  const root = page.locator(INSPECTOR);
  await root.locator('input').fill(url);
  await root.getByRole('button', { name: /inspect/i }).click();
  await expect(root.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
  return root;
}

test('lookalike domain is flagged and the link is never opened or sent', async ({ page }) => {
  await page.goto('/en/inspect');
  const root = page.locator(INSPECTOR);
  const url = 'http://paypal.com.secure-login.ru/account';
  await root.locator('input').fill(url);

  await assertNoNetworkLeak(page, ['paypal.com.secure-login', 'secure-login.ru'], async () => {
    await root.getByRole('button', { name: /inspect/i }).click();
    await expect(root.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
  });

  const level = Number(await root.locator('[role="meter"]').getAttribute('aria-valuenow'));
  expect(level).toBeGreaterThanOrEqual(2); // meaningfully elevated (deceptive subdomain + not-https)
  await expect.poll(() => root.locator('ul li h3').count()).toBeGreaterThan(0);

  // The inspector never navigates to the pasted link.
  expect(page.url()).toContain('/en/inspect');
});

test('raw-IP host fires a finding', async ({ page }) => {
  await page.goto('/en/inspect');
  const root = await inspect(page, 'http://192.168.0.1/login');
  expect(Number(await root.locator('[role="meter"]').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await expect.poll(() => root.locator('ul li h3').count()).toBeGreaterThan(0);
  expect(page.url()).toContain('/en/inspect');
});

test('userinfo "@" trick fires a finding', async ({ page }) => {
  await page.goto('/en/inspect');
  const root = await inspect(page, 'http://realbank.com@phishing.ru/');
  expect(Number(await root.locator('[role="meter"]').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await expect.poll(() => root.locator('ul li h3').count()).toBeGreaterThan(0);
});

test('a clean URL gets the softened "not a guarantee" copy, not false reassurance', async ({
  page,
}) => {
  await page.goto('/en/inspect');
  const root = await inspect(page, 'https://example.com');
  // Calm, honest clean state.
  await expect(root.getByText('NOTHING OBVIOUS FIRED')).toBeVisible();
  // "not a guarantee" appears in both the clean body and the disclaimer — first().
  await expect(root.getByText(/not a guarantee/i).first()).toBeVisible();
  // No finding cards on a clean URL.
  await expect(root.locator('ul li h3')).toHaveCount(0);
});
