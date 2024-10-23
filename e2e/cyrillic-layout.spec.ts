import { test, expect, type Page } from '@playwright/test';

/**
 * T0.2 — Cyrillic layout integrity. With self-hosted Geist (full Cyrillic
 * subset) the RU surfaces must render in Geist (not a system fallback) with no
 * horizontal overflow at 360px and 1280px, and long-form prose must stay within
 * a comfortable reading measure (~65ch).
 *
 * Overflow signal: body.scrollWidth. The documentElement can't be used because
 * globals.css sets `html { overflow-x: clip }`, which clamps its scrollWidth and
 * would mask real overflow. The body is not clipped, so its scrollWidth still
 * reports any child that runs past the viewport.
 */

const RU_PAGES = ['/ru/', '/ru/guide/phishing', '/ru/course', '/ru/journal', '/ru/check'];
const WIDTHS = [360, 1280];

async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const iw = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > iw + 2) {
        const cls = (el.className || '').toString().trim().split(/\s+/)[0] || '';
        offenders.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(r.right)}`);
      }
    }
    return { iw, bodyScrollW: document.body.scrollWidth, offenders: offenders.slice(0, 10) };
  });
}

for (const path of RU_PAGES) {
  for (const width of WIDTHS) {
    test(`RU ${path} @ ${width}px: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400); // let islands settle before measuring
      const o = await overflowReport(page);
      expect(
        o.bodyScrollW,
        `body overflows the ${width}px viewport (offenders: ${o.offenders.join(', ') || 'none reported'})`,
      ).toBeLessThanOrEqual(o.iw + 2);
    });
  }
}

test('RU body renders in self-hosted Geist (Cyrillic subset loaded, not fallback)', async ({ page }) => {
  await page.goto('/ru/guide/phishing', { waitUntil: 'load' });
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    const geistCyr = [...document.fonts].find(
      (f) => f.family === 'Geist' && /400-45F/.test(f.unicodeRange),
    );
    return {
      bodyFamily: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''),
      geistCyrillicStatus: geistCyr ? geistCyr.status : 'missing',
    };
  });
  expect(info.bodyFamily).toBe('Geist');
  // 'loaded' proves Cyrillic body text is painted with the self-hosted Geist
  // face (the subset only loads when matched to rendered glyphs).
  expect(info.geistCyrillicStatus).toBe('loaded');
});

test('RU long-form prose stays within ~65ch measure @ 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/ru/guide/phishing', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const cols = await page.evaluate(() => {
    const prose = document.querySelector('.prose');
    if (!prose) return null;
    const cs = getComputedStyle(prose);
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight}`;
    probe.textContent = '0'.repeat(100);
    document.body.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return prose.getBoundingClientRect().width / ch;
  });
  expect(cols, 'no .prose element found on the guide page').not.toBeNull();
  expect(cols as number).toBeLessThanOrEqual(66);
});
