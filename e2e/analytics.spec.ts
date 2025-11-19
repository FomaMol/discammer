import { test, expect, type Page } from '@playwright/test';

// Run against an isolated preview with a fake public website ID and SITE_ORIGIN
// equal to E2E_BASE_URL. All collection is intercepted: no synthetic traffic
// reaches an actual dashboard. See docs/analytics.md for the command.
test.skip(!process.env.ANALYTICS_E2E, 'Requires explicitly enabled analytics preview');
const endpoint = 'https://cloud.umami.is/api/send';

async function collect(page: Page) {
  const events: any[] = [];
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await page.route(endpoint, async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      expect(req.headers()['referer']).toBeUndefined();
      expect(req.headers()['cookie']).toBeUndefined();
      events.push(req.postDataJSON().payload);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return events;
}

for (const lang of ['en', 'ru']) {
  test(`${lang}: mobile disclosure remains readable`, async ({ page }) => {
    await collect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${lang}/portfolio`);
    await page.locator('footer details summary').click();
    await expect(page.locator('[data-analytics-opt-out]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('footer details').screenshot({ path: `/tmp/discammer-analytics-${lang}-mobile.png` });
  });

  test(`${lang}: real checker inputs never enter active analytics`, async ({ page }) => {
    const events = await collect(page);
    await page.goto(`/${lang}/check?email=PRIVATE_URL_SENTINEL#PRIVATE_HASH_SENTINEL`, { referer: 'https://admissions.example.edu/PRIVATE_REF_SENTINEL?token=SECRET' });
    await expect.poll(() => events.length).toBeGreaterThanOrEqual(2);
    const checker = page.locator('[data-component="MessageAnalyzer"]');
    await checker.locator('textarea').fill('PRIVATE_INPUT_SENTINEL: your bank account is blocked. Send password 123456');
    await checker.locator('button[type="submit"]').click();
    await expect(checker.locator('[role="meter"]')).toBeVisible();
    expect(events[0]).toMatchObject({ url: `/${lang}/check`, title: 'check', referrer: 'https://admissions.example.edu' });
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|SECRET|123456|password/);
    expect(events.some(e => 'id' in e)).toBe(false);
  });

  test(`${lang}: game funnel and persistent opt-out`, async ({ page }) => {
    const events = await collect(page);
    await page.route('**/play/', route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated game fixture</p>' }));
    await page.goto(`/${lang}/game`);
    await expect.poll(() => events.some(e => e.name === 'game_view')).toBe(true);
    await page.locator('[data-component="GameLauncher"] > button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => events.filter(e => e.name === 'game_launch').length).toBe(1);
    await page.keyboard.press('Escape');
    await page.locator('details').filter({ has: page.locator('[data-analytics-opt-out]') }).locator('summary').click();
    await page.locator('[data-analytics-opt-out]').click();
    await expect(page.locator('[data-analytics-status]')).not.toBeEmpty();
    const count = events.length;
    await page.goto(`/${lang}/portfolio`);
    await expect(page.locator('[data-component="MobileMenu"] button').first()).toBeAttached();
    expect(events.length).toBe(count);
  });
}

test('engagement requires time plus real interaction and fires once', async ({ page }) => {
  const events = await collect(page);
  await page.clock.install();
  await page.goto('/en/portfolio');
  await expect.poll(() => events.some(e => e.name === 'portfolio_view')).toBe(true);
  await page.clock.runFor(31_000);
  expect(events.some(e => e.name === 'page_engaged')).toBe(false);
  await page.locator('h1').click();
  await page.clock.runFor(1500);
  await expect.poll(() => events.filter(e => e.name === 'page_engaged').length).toBe(1);
  await page.clock.runFor(35_000);
  expect(events.filter(e => e.name === 'page_engaged').length).toBe(1);
});

test('lesson completion emits only its bounded event', async ({ page }) => {
  const events = await collect(page);
  await page.goto('/en/course');
  const module = await page.locator('main a[href^="/en/course/"]').first().getAttribute('href');
  await page.goto(module!);
  const lesson = await page.locator(`main a[href^="${module}/"]`).first().getAttribute('href');
  await page.goto(lesson!);
  await expect.poll(() => events.some(e => e.name === 'lesson_view')).toBe(true);
  await page.locator('[data-component="LessonFooter"] button').click();
  await expect.poll(() => events.filter(e => e.name === 'lesson_complete').length).toBe(1);
  expect(events.find(e => e.name === 'lesson_complete').data).toEqual({ language: 'en', surface: 'lesson' });
});

test('privacy signals suppress all collection', async ({ page }) => {
  const events = await collect(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
  await page.goto('/en/portfolio');
  await expect(page.locator('[data-analytics-status]')).not.toBeEmpty();
  expect(events).toHaveLength(0);
});

test('JavaScript-off pages and disclosure remain usable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const events: string[] = [];
  page.on('request', req => { if (req.url() === endpoint) events.push(req.url()); });
  for (const lang of ['en', 'ru']) {
    await page.goto(`${process.env.E2E_BASE_URL}/${lang}/portfolio`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('footer details')).toBeVisible();
  }
  expect(events).toHaveLength(0);
  await context.close();
});
