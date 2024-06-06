import { test, expect, type Page } from '@playwright/test';
import { SCAM_FIXTURE, BENIGN_FIXTURE } from './helpers';

/**
 * Message analyzer (/{lang}/check). The analysis is 100% client-side — the text
 * the user pastes must never leave the browser. These tests assert:
 *   - a scam fixture fires >= 1 flag and the threat meter reads a non-zero level,
 *   - a benign message fires zero flags,
 *   - NO network request carries the pasted text (URL or POST body).
 */

const METER = '[role="meter"]';
const TEXTAREA = 'textarea';
const ANALYZE = 'button[type="submit"]';

/**
 * Record every request's URL + post body while running `action`, then assert the
 * fixture text never appears in any of them. Distinctive substrings of the
 * fixture are used so we don't depend on exact encoding.
 */
async function assertNoLeak(page: Page, fixture: string, action: () => Promise<void>) {
  const captured: string[] = [];
  const handler = (req: import('@playwright/test').Request) => {
    captured.push(req.url());
    const body = req.postData();
    if (body) captured.push(body);
  };
  page.on('request', handler);
  try {
    await action();
    // Allow any (hypothetical) request to fire.
    await page.waitForTimeout(500);
  } finally {
    page.off('request', handler);
  }

  // Pick distinctive tokens from the fixture that would never legitimately be in
  // a static asset URL.
  const needles = ['Sberbank', 'one-time', 'bit.ly%2Fsecure', 'bit.ly/secure', 'lunch'];
  for (const text of captured) {
    for (const needle of needles) {
      expect(
        text.includes(needle),
        `request leaked fixture text "${needle}":\n${text}`,
      ).toBeFalsy();
    }
  }
}

test('scam fixture fires flags and a non-zero threat level — no text leaves the browser', async ({
  page,
}) => {
  await page.goto('/en/check');
  await page.locator(TEXTAREA).fill(SCAM_FIXTURE);

  await assertNoLeak(page, SCAM_FIXTURE, async () => {
    await page.locator(ANALYZE).click();
    // Meter appears once analysis runs.
    await expect(page.locator(METER)).toBeVisible();
  });

  // At least one fired-flag card is shown (each fired flag is an <li> under the
  // results <ul>; the flags list carries an <h3> per flag).
  const flagHeadings = page.locator('ul li h3');
  await expect.poll(() => flagHeadings.count()).toBeGreaterThan(0);

  // Threat meter reports a non-zero level via aria-valuenow + aria-label.
  const meter = page.locator(METER);
  const valueNow = await meter.getAttribute('aria-valuenow');
  expect(Number(valueNow)).toBeGreaterThan(0);
  const label = await meter.getAttribute('aria-label');
  // EN label: "Threat read: N of 5" — must not read 0.
  expect(label).toMatch(/Threat read: [1-5] of 5/);
});

test('benign message fires zero flags', async ({ page }) => {
  await page.goto('/en/check');
  await page.locator(TEXTAREA).fill(BENIGN_FIXTURE);
  await page.locator(ANALYZE).click();

  await expect(page.locator(METER)).toBeVisible();
  // Meter reads level 0.
  await expect(page.locator(METER)).toHaveAttribute('aria-valuenow', '0');
  // The calm "nothing fired" heading renders, and there are no flag <li> headings.
  await expect(page.getByText('NOTHING OBVIOUS FIRED')).toBeVisible();
  await expect(page.locator('ul li h3')).toHaveCount(0);
});
