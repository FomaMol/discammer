import { test, expect, type Page } from '@playwright/test';

/**
 * i18n integrity on Russian pages. The island translator warns
 * `console.warn('[i18n] missing', ...)` on a lookup miss and returns the raw key
 * (e.g. `client.foo` / `flags.bar`). On a correctly-localized page there must be
 * NO such warning and NO raw key leaking into visible text.
 */

const RU_PAGES = ['/ru/', '/ru/course', '/ru/check'];

function collectI18nWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('[i18n] missing')) {
      warnings.push(msg.text());
    }
  });
  return warnings;
}

for (const path of RU_PAGES) {
  test(`RU page ${path}: no missing-i18n warning, no raw key leak`, async ({ page }) => {
    const warnings = collectI18nWarnings(page);
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    // Let islands hydrate so any translator miss fires.
    await page.waitForTimeout(800);

    expect(warnings, `[i18n] missing warnings on ${path}:\n${warnings.join('\n')}`).toEqual([]);

    // No raw translation key (e.g. "client.x", "flags.y", "analyzer.z") should
    // appear in the visible body text.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\bclient\.[a-z_]+/i);
    expect(bodyText).not.toMatch(/\bflags\.[a-z_]+_(label|body)\b/i);
  });
}

test('RU nav renders the localized "КУРС" label', async ({ page }) => {
  await page.goto('/ru/');
  // The desktop nav COURSE link reads КУРС in Russian.
  await expect(page.locator('nav a[href="/ru/course"]').first()).toHaveText(/КУРС/);
});
