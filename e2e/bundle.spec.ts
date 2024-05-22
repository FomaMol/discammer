import { test, expect, type Page } from '@playwright/test';

/**
 * Bundle / code-splitting guarantees.
 *
 * The home page must NOT pull the VideoPlayer chunk (which bundles Plyr); a post
 * page that embeds a video MUST request it. And nowhere should React's
 * single-instance invariant break (error #321 / "Invalid hook call"), which
 * would happen if a dynamic chunk shipped a second React.
 *
 * Chunk filenames are content-hashed and component-prefixed, e.g.
 * /static/js/chunks/VideoPlayer-XXXX.js — so a path regex on `VideoPlayer-`
 * uniquely identifies the Plyr chunk.
 */

const VIDEO_CHUNK_RE = /\/chunks\/VideoPlayer-[^/]*\.js(\?|$)/;
const REACT_ERROR_RE = /(Minified React error #321|Invalid hook call)/i;

function trackChunks(page: Page): { urls: string[]; reactErrors: string[] } {
  const urls: string[] = [];
  const reactErrors: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/\/chunks\/.*\.js/.test(url)) urls.push(url);
  });
  page.on('console', (msg) => {
    if (REACT_ERROR_RE.test(msg.text())) reactErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (REACT_ERROR_RE.test(err.message)) reactErrors.push(err.message);
  });
  return { urls, reactErrors };
}

test('home page does NOT request the VideoPlayer/Plyr chunk', async ({ page }) => {
  const { urls, reactErrors } = trackChunks(page);
  await page.goto('/en/', { waitUntil: 'networkidle' });
  // Give lazy island chunks time to (not) appear.
  await page.waitForTimeout(500);

  const videoChunkRequests = urls.filter((u) => VIDEO_CHUNK_RE.test(u));
  expect(videoChunkRequests, 'home must not load the VideoPlayer chunk').toEqual([]);
  expect(reactErrors, 'no React single-instance errors on home').toEqual([]);
});

test('post page WITH a video DOES request the VideoPlayer/Plyr chunk', async ({ page }) => {
  const { urls, reactErrors } = trackChunks(page);
  await page.goto('/en/journal/blockchain', { waitUntil: 'networkidle' });

  await expect
    .poll(() => urls.filter((u) => VIDEO_CHUNK_RE.test(u)).length, { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(reactErrors, 'no React single-instance errors on the post page').toEqual([]);
});
