import { test, expect } from '@playwright/test';

/**
 * Regression guard for the 2026-07-14 screenshot bug (FEATURE_PLAN Wave 0,
 * Task 0.2). `/en/game` renders the GameLauncher island, whose Launch button
 * opens a modal with `<iframe src="/play/">` (the Unity build).
 *
 * The SEC-1 hardening (commit 24dc396) sent `X-Frame-Options: DENY` on ALL HTML
 * responses, including `/play/`, so Chrome rendered "refused to connect" inside
 * the frame. Fix ea812fc makes `/play/` answer SAMEORIGIN and adds `'self'` to
 * `frame-src`. bundle.spec.ts only asserted the /en/game LINK existed — it never
 * launched the iframe, so the regression shipped uncaught. This spec launches it
 * for real and asserts the framed document actually renders (Unity container
 * present, not a chrome-error interstitial).
 */

const PLAY_DOC_RE = /\/play\/$/;

test('GameLauncher opens /play/ in a same-origin iframe that actually renders', async ({
  page,
}) => {
  // Arm the response wait BEFORE the click so we never miss it.
  const playResponsePromise = page.waitForResponse(
    (r) => PLAY_DOC_RE.test(new URL(r.url()).pathname) && r.request().method() === 'GET'
  );

  await page.goto('/en/game', { waitUntil: 'domcontentloaded' });

  // The GameLauncher island hydrates the Launch CTA into a real <button>
  // (the <noscript> fallback <a> is inert while JS is on). Auto-waits for it.
  const launch = page.getByRole('button', { name: /launch simulation/i });
  await expect(launch).toBeVisible();
  await launch.click();

  // Modal dialog with the embedded game.
  const dialog = page.getByRole('dialog', { name: 'Antifraud Hero' });
  await expect(dialog).toBeVisible();

  const frameEl = dialog.locator('iframe[title="Antifraud Hero"]');
  await expect(frameEl).toHaveAttribute('src', '/play/');

  // The framed document must have loaded with HTTP 200 and, critically,
  // X-Frame-Options: SAMEORIGIN — DENY is exactly what broke the frame.
  const playResponse = await playResponsePromise;
  expect(playResponse.status()).toBe(200);
  expect(
    (playResponse.headers()['x-frame-options'] || '').toUpperCase(),
    'DENY here reproduces the "refused to connect" regression'
  ).toBe('SAMEORIGIN');

  // Prove the browser actually rendered /play/ inside the frame (Unity shell
  // present) rather than a chrome-error page, which has no such element.
  const framed = frameEl.contentFrame();
  await expect(framed.locator('#unity-container')).toBeAttached();

  // Escape closes the dialog (GameLauncher's key handler).
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('GameLauncher dialog is keyboard accessible — no focus trap (UX-3)', async ({ page }) => {
  await page.goto('/en/game', { waitUntil: 'domcontentloaded' });
  const launch = page.getByRole('button', { name: /launch simulation/i });
  await launch.click();

  const dialog = page.getByRole('dialog', { name: 'Antifraud Hero' });
  await expect(dialog).toBeVisible();

  // On open, focus moves INTO the dialog (the Close button) — not stranded on the
  // now-inert page behind the modal.
  const closeBtn = dialog.getByRole('button');
  await expect(closeBtn).toBeFocused();

  // Escape always exits (WCAG 2.1.2 No Keyboard Trap) and focus RETURNS to the
  // trigger, so a keyboard user is never stuck and never loses their place.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launch).toBeFocused();
});
