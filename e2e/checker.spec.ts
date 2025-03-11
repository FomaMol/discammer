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

/**
 * UX-2 onboarding — the /check MessageAnalyzer "Load example" button. One click
 * must fill the textarea with the localized canned scam AND render its verdict
 * (meter + >=1 flag) without a second click, in both languages, and nothing the
 * example contains may leave the browser.
 */
const ANALYZER = '[data-component="MessageAnalyzer"]';
const ANALYZER_LOAD_EXAMPLE: Record<string, RegExp> = {
  en: /load example/i,
  ru: /Загрузить пример/i,
};
const ANALYZER_EXAMPLE_NEEDLES: Record<string, string[]> = {
  en: ['verify-account', 'security department', 'one-time code'],
  ru: ['verify-account', 'служба безопасности', 'код из СМС'],
};

for (const lang of ['en', 'ru']) {
  test(`${lang}: /check "Load example" fills the input and renders a verdict in one click — no text leaves the browser`, async ({
    page,
  }) => {
    await page.goto(`/${lang}/check`);
    const root = page.locator(ANALYZER);
    await expect(root).toBeAttached();

    const textarea = root.locator('textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(''); // starts empty

    const loadBtn = root.getByRole('button', { name: ANALYZER_LOAD_EXAMPLE[lang] });
    await expect(loadBtn).toBeVisible();

    // The example is a static local string — loading it must not hit the network.
    await assertNoNetworkLeak(page, ANALYZER_EXAMPLE_NEEDLES[lang], async () => {
      await loadBtn.click();
      await expect(root.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
    });

    // The click filled the textarea…
    expect((await textarea.inputValue()).length).toBeGreaterThan(0);

    // …and rendered a non-zero meter + at least one flag card in the SAME click.
    const meter = root.locator('[role="meter"]');
    expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await expect
      .poll(() => root.locator('[aria-live="polite"] ul li').count())
      .toBeGreaterThan(0);
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
