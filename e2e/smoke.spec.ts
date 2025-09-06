import { test, expect } from '@playwright/test';
import {
  PAGES,
  collectConsoleErrors,
  appConsoleErrors,
  collectFailedResponses,
  appFailedResponses,
  expectIslandHydrated,
} from './helpers';

/**
 * Smoke sweep — every localized page (en + ru) must:
 *   1. return HTTP 200,
 *   2. produce ZERO application console errors / pageerrors (prod-only media
 *      404s are filtered — see helpers), and no NON-media failed requests,
 *   3. hydrate at least one React island.
 *
 * The `@smoke` tag (in the test titles) marks the subset that is also safe to
 * run READ-ONLY against PRODUCTION after a deploy. `scripts/smoke-prod.sh`
 * selects them via `--grep @smoke`. Everything tagged here is a plain GET +
 * passive assertion — no writes, no analyzer/URL input (privacy: see O3).
 */
test.describe('smoke: all pages 200, no console errors, island hydrates', () => {
  for (const { path, label, island } of PAGES) {
    test(`@smoke ${label} ${path}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      const failed = collectFailedResponses(page);

      const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(resp, `no response for ${path}`).toBeTruthy();
      expect(resp!.status(), `status for ${path}`).toBe(200);

      // At least one island hydrated (proves the bundle loaded + ran).
      await expectIslandHydrated(page, island);

      // Let any deferred chunk console output / requests flush.
      await page.waitForTimeout(300);

      const appErrors = appConsoleErrors(errors);
      expect(appErrors, `console errors on ${path}:\n${appErrors.join('\n')}`).toEqual([]);

      const realFailures = appFailedResponses(failed);
      expect(realFailures, `failed requests on ${path}:\n${realFailures.join('\n')}`).toEqual([]);
    });
  }
});

/**
 * Deploy-version probe. /api/health must report a non-empty build version. In
 * prod the deploy pipeline stamps the short git SHA (GIT_SHA build-arg → ENV);
 * locally it defaults to "dev". When SMOKE_EXPECT_SHA is set (e.g. CI passes
 * the just-deployed `${{ github.sha }}` short SHA), we assert it MATCHES — so a
 * smoke run can prove the box actually picked up the new code, not a stale
 * image. Unset (local dev), any non-empty version passes.
 */
test('@smoke /api/health reports a build version (matches SMOKE_EXPECT_SHA when set)', async ({
  request,
}) => {
  const resp = await request.get('/api/health');
  expect(resp.status(), '/api/health status').toBe(200);
  const body = await resp.json();
  expect(body.status, 'health status field').toBe('ok');
  expect(body.db, 'db connectivity').toBe('ok');

  const version = String(body.version ?? '');
  expect(version.length, '/api/health version must be non-empty').toBeGreaterThan(0);

  const expected = process.env.SMOKE_EXPECT_SHA;
  if (expected && expected.length > 0) {
    // The deployer stamps the SHORT sha (git rev-parse --short HEAD), so accept
    // either an exact match or a short-prefix match against the full sha CI has.
    const ok = version === expected || expected.startsWith(version) || version.startsWith(expected);
    expect(
      ok,
      `deployed version "${version}" does not match expected SHA "${expected}" — the box may be running a stale image`,
    ).toBe(true);
  }
});

/**
 * Redirects must not leave TLS.
 *
 * Production answered every trailing-slash URL with a 307 to a CLEARTEXT
 * location — `https://discammer.com/en/course/` -> `http://discammer.com/en/course`
 * (2026-08-01), on a zone that sends no HSTS, so browsers really opened port 80
 * before bouncing back. Starlette's `redirect_slashes` builds its absolute
 * Location from the ASGI scope scheme, which stays "http" whenever uvicorn does
 * not trust nginx's `X-Forwarded-Proto` (see docker-compose.prod.yml's
 * FORWARDED_ALLOW_IPS). Only a live https origin can observe this, so the
 * assertion is meaningless against a local http server — hence the skip.
 */
test('@smoke a trailing-slash redirect keeps the https scheme', async ({ request, baseURL }) => {
  test.skip(!baseURL?.startsWith('https://'), 'scheme downgrade is only observable over https');

  const resp = await request.get('/en/course/', { maxRedirects: 0 });
  expect([301, 302, 307, 308], 'trailing slash should redirect').toContain(resp.status());

  const location = resp.headers()['location'] ?? '';
  expect(location.length, 'redirect carries a Location').toBeGreaterThan(0);
  // A relative Location is fine — it inherits the request's scheme. An absolute
  // one must stay on https.
  if (/^[a-z][a-z0-9+.-]*:/i.test(location)) {
    expect(
      location.startsWith('https://'),
      `redirect Location downgraded to cleartext: ${location}`,
    ).toBe(true);
  }
});

/**
 * A MISSING hashed asset must never be cacheable.
 *
 * The Cache-Control middleware keyed the year-long `immutable` header off the
 * path prefix alone, so a 404 under /static/js/ or /static/css/ went out as
 * `max-age=31536000, immutable` and Cloudflare pinned it (`cf-cache-status`
 * MISS then HIT with a climbing age, 2026-08-01). One request for a new hash
 * during a deploy window then froze that 404 at the edge for a year, and every
 * visitor behind that PoP got the HTML with no CSS and no JS. Probing a hash
 * that cannot exist is a read-only GET, safe against production.
 */
test('@smoke a missing hashed asset is not cached', async ({ request }) => {
  const resp = await request.get('/static/js/chunks/smoke-absent-DEADBEEF.js');
  expect(resp.status(), 'a nonexistent chunk must 404').toBe(404);

  const cacheControl = (resp.headers()['cache-control'] ?? '').toLowerCase();
  expect(
    cacheControl.includes('immutable') || cacheControl.includes('max-age=31536000'),
    `a 404 for a hashed asset must not be cacheable, got: ${cacheControl || '<none>'}`,
  ).toBe(false);
});

/**
 * Hydration health — at least one React island must mount on the home page.
 * `[data-component]` marks every island; after main.tsx runs, a hydrated island
 * has a non-empty rendered subtree. A zero count means the bundle failed to
 * load/execute (a deploy that shipped a broken or missing app.js), which the
 * per-page checks above would also catch, but this asserts the COUNT directly
 * as the contract requires.
 */
test('@smoke home hydrates at least one island', async ({ page }) => {
  await page.goto('/en/', { waitUntil: 'domcontentloaded' });
  // Wait for the island bootstrap + at least one lazy chunk to render.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll('[data-component]'));
          return nodes.filter(
            (n) => n.childElementCount > 0 || (n.textContent ?? '').trim().length > 0,
          ).length;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});
