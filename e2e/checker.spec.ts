import { test, expect } from '@playwright/test';
import { SCAM_FIXTURE, BENIGN_FIXTURE, assertNoNetworkLeak } from './helpers';

/**
 * T1.1 — the hero MessageChecker island (home). Reuses the pure analyze() engine,
 * runs fully client-side. Asserts (per the senior-review blockers): pasting a
 * known scam fires >=1 named tell + a non-zero threat meter, the result is in an
 * aria-live region, a tell links to its guide (detection->learning loop), the
 * privacy line is always present, and NOTHING the user types leaves the browser.
 */

const CHECKER = '[data-component="MessageChecker"]';
const SCAM_NEEDLES = ['Sberbank', 'one-time', 'bit.ly/secure', 'bit.ly%2Fsecure'];

for (const lang of ['en', 'ru']) {
  test(`${lang}: hero checker fires a tell, announces it, links a guide — no text leaves the browser`, async ({
    page,
  }) => {
    await page.goto(`/${lang}/`);
    const checker = page.locator(CHECKER);
    await expect(checker).toBeAttached();
    const textarea = checker.locator('textarea');
    await expect(textarea).toBeVisible();

    // Nothing the user types may hit the network (debounced, pure analysis).
    await assertNoNetworkLeak(page, SCAM_NEEDLES, async () => {
      await textarea.fill(SCAM_FIXTURE);
      await expect(checker.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
    });

    // Result lives in a polite live region (SR users hear the verdict).
    await expect(checker.locator('[aria-live="polite"]')).toBeAttached();

    // Non-zero threat level; the level number appears in the localized aria-label.
    const meter = checker.locator('[role="meter"]');
    const valueNow = await meter.getAttribute('aria-valuenow');
    expect(Number(valueNow)).toBeGreaterThan(0);
    const label = await meter.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!).toContain(String(valueNow));

    // >=1 named tell, and at least one links to its guide (detection->learning).
    await expect
      .poll(() => checker.locator('[aria-live="polite"] ul li').count())
      .toBeGreaterThan(0);
    await expect(
      checker.locator(`[aria-live="polite"] a[href*="/${lang}/guide/"]`).first(),
    ).toBeVisible();

    // Privacy line is always present.
    await expect(checker.getByText(/browser|браузер/i)).toBeVisible();
  });
}

test('en: a benign message fires no tells (calm clean state, no guide links)', async ({ page }) => {
  await page.goto('/en/');
  const checker = page.locator(CHECKER);
  await checker.locator('textarea').fill(BENIGN_FIXTURE);
  await expect(checker.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
  await expect(checker.locator('[role="meter"]')).toHaveAttribute('aria-valuenow', '0');
  await expect(checker.locator('[aria-live="polite"] ul li')).toHaveCount(0);
});
