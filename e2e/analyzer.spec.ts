import { test, expect, type Browser, type Page } from '@playwright/test';
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
const INCIDENT_WIZARD = '[data-incident-action-wizard]';

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

test('local action wizard works after a clean result and keeps the pasted message local', async ({ page }) => {
  await page.goto('/en/check');
  await page.locator(TEXTAREA).fill(BENIGN_FIXTURE);

  const wizard = page.locator(INCIDENT_WIZARD);
  await assertNoLeak(page, BENIGN_FIXTURE, async () => {
    await page.locator(ANALYZE).click();
    await expect(page.locator(METER)).toBeVisible();
    await expect(wizard).toBeVisible();

    await wizard.locator('summary').click();
    const money = wizard.getByRole('checkbox').first();
    await money.check();
    const status = wizard.getByRole('status');
    await expect(status).toHaveText('4 neutral next steps are ready.');

    await wizard.getByRole('checkbox').nth(1).check();
    await expect(status).toHaveText('5 neutral next steps are ready.');
  });

  await expect(wizard.getByRole('checkbox')).toHaveCount(5);
  await expect(wizard.locator('ol li')).toHaveCount(5);

  await wizard.getByRole('button').click();
  await expect(wizard.getByRole('checkbox').first()).not.toBeChecked();
  await expect(wizard.getByRole('status')).toHaveCount(0);
});

test('local action wizard supports a keyboard-only impact choice and reset', async ({ page }) => {
  await page.goto('/en/check');
  await page.locator(TEXTAREA).fill(SCAM_FIXTURE);
  await page.locator(ANALYZE).click();

  const wizard = page.locator(INCIDENT_WIZARD);
  await expect(wizard).toBeVisible();

  const summary = wizard.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');

  const firstImpact = wizard.getByRole('checkbox').first();
  await firstImpact.focus();
  await page.keyboard.press('Space');
  await expect(firstImpact).toBeChecked();
  await expect(wizard.getByRole('status')).toHaveText('4 neutral next steps are ready.');

  const reset = wizard.getByRole('button');
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(firstImpact).not.toBeChecked();
});

test('RU local action wizard supports keyboard selection', async ({ page }) => {
  await page.goto('/ru/check');
  await page.locator(TEXTAREA).fill(SCAM_FIXTURE);
  await page.locator(ANALYZE).click();

  const wizard = page.locator(INCIDENT_WIZARD);
  await expect(wizard).toBeVisible();
  const summary = wizard.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');

  const firstImpact = wizard.getByRole('checkbox').first();
  await firstImpact.focus();
  await page.keyboard.press('Space');
  await expect(firstImpact).toBeChecked();
  await expect(wizard.getByRole('status')).toHaveText('Готовы нейтральные следующие шаги: 4.');
});

test('SSR incident guidance remains useful with JavaScript disabled in both locales', async ({ browser }) => {
  const noJsContext = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();

  try {
    for (const [path, heading, checklist] of [
      ['/en/check', 'If you already acted', '60-second checklist'],
      ['/ru/check', 'Если вы уже успели что-то сделать', 'Чек-лист на 60 секунд'],
    ]) {
      await noJsPage.goto(path);
      await expect(noJsPage.locator('#check-incident-heading')).toHaveText(heading);
      await expect(noJsPage.locator('#check-noscript-heading')).toHaveText(checklist);
    }
  } finally {
    await noJsContext.close();
  }
});

test('SSR incident guidance is restored when the analyzer chunk cannot load', async ({ page }) => {
  let analyzerChunkWasBlocked = false;
  await page.route('**/static/js/chunks/MessageAnalyzer-*.js', async (route) => {
    analyzerChunkWasBlocked = true;
    await route.abort();
  });

  await page.goto('/en/check');
  await expect.poll(() => analyzerChunkWasBlocked).toBe(true);
  await expect(page.locator('#check-incident-heading')).toHaveText('If you already acted');
  await expect(page.locator(INCIDENT_WIZARD)).toHaveCount(0);
});
