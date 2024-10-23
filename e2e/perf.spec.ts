import { test, expect } from '@playwright/test';

/**
 * T0.2 self-hosted fonts — delivery guarantees ("fonts non-blocking; no CLS
 * from font swap"). We assert the DETERMINISTIC proxies for a non-blocking,
 * shift-free font load rather than an absolute LCP-millisecond budget (which is
 * environment-dependent and would flake in CI):
 *   - no third-party font origin (no gstatic / googleapis round-trip),
 *   - the active language's primary subset is <link rel=preload as=font crossorigin>,
 *   - every @font-face uses font-display:swap (FOUT, never invisible text),
 *   - the self-hosted woff2 serve 200, and Geist + JetBrains Mono are `loaded`
 *     once fonts settle.
 *
 * Preload + same-origin + swap is what structurally prevents font-swap layout
 * shift. We deliberately do NOT assert a whole-page CLS number here: the home's
 * islands (HeroShader / MessageChecker) hydrate after first paint and contribute
 * shifts unrelated to font loading, which would make a numeric CLS gate noisy.
 */

const EXTERNAL_FONT_RE = /fonts\.(googleapis|gstatic)\.com/;

// EN preloads only latin; RU is bilingual in practice (Cyrillic body + Latin
// wordmark/brand/punctuation) so it preloads BOTH subsets of both families.
const CASES: { path: string; subsets: string[] }[] = [
  { path: '/en/', subsets: ['latin'] },
  { path: '/ru/', subsets: ['cyrillic', 'latin'] },
];

const FAMILIES = ['geist', 'jetbrains-mono'];

for (const { path, subsets } of CASES) {
  test(`${path}: no third-party font origin (self-hosted only)`, async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (EXTERNAL_FONT_RE.test(r.url())) external.push(r.url());
    });
    await page.goto(path, { waitUntil: 'load' });
    const html = await page.content();
    expect(html, 'page HTML still references a Google Fonts origin').not.toMatch(EXTERNAL_FONT_RE);
    expect(external, `unexpected external font requests:\n${external.join('\n')}`).toEqual([]);
  });

  test(`${path}: preloads the ${subsets.join('+')} subset(s) (as=font, crossorigin, woff2)`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const preloads = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((els) =>
        els.map((el) => ({
          href: el.getAttribute('href'),
          crossOrigin: (el as HTMLLinkElement).crossOrigin,
          type: el.getAttribute('type'),
        })),
      );
    const hrefs = preloads.map((p) => p.href).sort();
    const expected = subsets
      .flatMap((s) => FAMILIES.map((f) => `/static/fonts/${f}-${s}.woff2`))
      .sort();
    expect(hrefs).toEqual(expected);
    for (const p of preloads) {
      expect(p.crossOrigin, 'font preload must be crossorigin=anonymous').toBe('anonymous');
      expect(p.type).toBe('font/woff2');
    }
  });

  test(`${path}: every @font-face uses font-display:swap and both families load`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    const info = await page.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts];
      return {
        total: faces.length,
        allSwap: faces.every((f) => f.display === 'swap'),
        loadedFamilies: [...new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family))],
      };
    });
    // 2 families × 4 subsets (latin / latin-ext / cyrillic / cyrillic-ext).
    expect(info.total).toBeGreaterThanOrEqual(8);
    expect(info.allSwap, 'a @font-face is missing font-display:swap').toBe(true);
    expect(info.loadedFamilies).toContain('Geist');
    expect(info.loadedFamilies).toContain('JetBrains Mono');
  });

  test(`${path}: preloaded ${subsets.join('+')} woff2 serve 200`, async ({ page }) => {
    for (const subset of subsets) {
      for (const family of FAMILIES) {
        const url = `/static/fonts/${family}-${subset}.woff2`;
        const resp = await page.request.get(url);
        expect(resp.status(), url).toBe(200);
        const body = await resp.body();
        // wOF2 magic header + non-trivial payload.
        expect(body.length, url).toBeGreaterThan(1000);
        expect(body.subarray(0, 4).toString('ascii'), `${url} is not a woff2`).toBe('wOF2');
      }
    }
  });
}
