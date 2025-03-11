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
const INCIDENT_WIZARD = '[data-incident-action-wizard]';

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

test('local action guidance appears after both clean and elevated link reads', async ({ page }) => {
  for (const url of ['https://example.com', 'http://paypal.com.secure-login.ru/account']) {
    await page.goto('/en/inspect');
    await inspect(page, url);

    const wizard = page.locator(INCIDENT_WIZARD);
    await expect(wizard).toBeVisible();
    await wizard.locator('summary').click();
    await expect(wizard.getByRole('checkbox')).toHaveCount(5);
  }
});

test('local action guidance supports keyboard-only impact selection in both languages', async ({ page }) => {
  for (const [path, expectedStatus] of [
    ['/en/inspect', '4 neutral next steps are ready.'],
    ['/ru/inspect', 'Готовы нейтральные следующие шаги: 4.'],
  ]) {
    await page.goto(path);
    const root = page.locator(INSPECTOR);
    await root.locator('input').fill('https://example.com');
    // The primary action is the submit button; a second "Load example" button
    // (type=button) now shares the container, so target submit specifically.
    await root.locator('button[type="submit"]').click();

    const wizard = page.locator(INCIDENT_WIZARD);
    await expect(wizard).toBeVisible();

    const summary = wizard.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');

    const firstImpact = wizard.getByRole('checkbox').first();
    await firstImpact.focus();
    await page.keyboard.press('Space');
    await expect(firstImpact).toBeChecked();
    await expect(wizard.getByRole('status')).toHaveText(expectedStatus);
  }
});

test('inspect SSR action guidance remains useful with JavaScript disabled in both locales', async ({
  browser,
}) => {
  const noJsContext = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();

  try {
    for (const [path, heading, checklist] of [
      ['/en/inspect', 'If you already opened the link', 'HOW TO READ A LINK BY HAND'],
      ['/ru/inspect', 'Если вы уже открыли ссылку', 'КАК ЧИТАТЬ ССЫЛКУ ВРУЧНУЮ'],
    ]) {
      await noJsPage.goto(path);
      await expect(noJsPage.locator('#inspect-incident-heading')).toHaveText(heading);
      await expect(noJsPage.locator('#inspect-noscript-heading')).toHaveText(checklist);
    }
  } finally {
    await noJsContext.close();
  }
});

test('SSR action guidance is restored when the inspector chunk cannot load', async ({ page }) => {
  let inspectorChunkWasBlocked = false;
  await page.route('**/static/js/chunks/LinkInspector-*.js', async (route) => {
    inspectorChunkWasBlocked = true;
    await route.abort();
  });

  await page.goto('/en/inspect');
  await expect.poll(() => inspectorChunkWasBlocked).toBe(true);
  await expect(page.locator('#inspect-incident-heading')).toHaveText('If you already opened the link');
  await expect(page.locator(INCIDENT_WIZARD)).toHaveCount(0);
});

/**
 * UX-2 onboarding — the /inspect LinkInspector "Load example" button. One click
 * must fill the input with the localized canned lookalike URL AND render its
 * findings (meter + >=1 finding) without a second click, in both languages, and
 * the example URL must never leave the browser or be opened.
 */
const INSPECTOR_LOAD_EXAMPLE: Record<string, RegExp> = {
  en: /load example/i,
  ru: /Загрузить пример/i,
};

for (const lang of ['en', 'ru']) {
  test(`${lang}: "Load example" fills the input and renders findings in one click — nothing leaves the browser`, async ({
    page,
  }) => {
    await page.goto(`/${lang}/inspect`);
    const root = page.locator(INSPECTOR);
    await expect(root).toBeAttached();

    // The URL field specifically — after findings render, the incident-action
    // wizard adds checkbox inputs to this island, so a bare `input` is ambiguous.
    const input = root.locator('input[inputmode="url"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(''); // starts empty

    const loadBtn = root.getByRole('button', { name: INSPECTOR_LOAD_EXAMPLE[lang] });
    await expect(loadBtn).toBeVisible();

    // The example URL is a static local string — loading it must not hit the
    // network, and the inspector must not navigate to it.
    await assertNoNetworkLeak(page, ['secure-login-verify', 'your-bank.example.com'], async () => {
      await loadBtn.click();
      await expect(root.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
    });

    // The click filled the input…
    expect((await input.inputValue()).length).toBeGreaterThan(0);

    // …and rendered a non-zero meter + at least one finding card in ONE click.
    const meter = root.locator('[role="meter"]');
    expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await expect.poll(() => root.locator('ul li h3').count()).toBeGreaterThan(0);

    // Never navigates to the pasted link.
    expect(page.url()).toContain(`/${lang}/inspect`);
  });
}

test('an inspected URL stays out of requests, browser storage, and the address bar', async ({
  page,
}) => {
  const url = 'https://local-privacy-probe.invalid/check?fixture-nonce=8be31';
  const root = page.locator(INSPECTOR);
  await page.goto('/en/inspect');
  await root.locator('input').fill(url);

  await assertNoNetworkLeak(page, ['local-privacy-probe', 'fixture-nonce=8be31'], async () => {
    await root.getByRole('button', { name: /inspect/i }).click();
    await expect(root.locator('[role="meter"]')).toBeVisible({ timeout: 5_000 });
  });

  expect(new URL(page.url()).pathname).toBe('/en/inspect');
  expect(page.url()).not.toContain('local-privacy-probe');

  const browserState = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(JSON.stringify(browserState)).not.toContain('local-privacy-probe');
  expect(JSON.stringify(browserState)).not.toContain('fixture-nonce=8be31');

  await page.reload();
  await expect(page.locator(INSPECTOR).locator('input')).toHaveValue('');
});
