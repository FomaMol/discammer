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
 */
test.describe('smoke: all pages 200, no console errors, island hydrates', () => {
  for (const { path, label, island } of PAGES) {
    test(`${label} ${path}`, async ({ page }) => {
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
