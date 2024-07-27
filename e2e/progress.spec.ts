import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Dossier export / import roundtrip (CourseProgress → DossierFooter).
 *
 * EXPORT downloads a versioned JSON snapshot of progress + exam + cert name.
 * IMPORT merges a dossier file back in (best-of, non-destructive). We:
 *   1. seed some completed lessons,
 *   2. click EXPORT and capture the download (assert filename pattern + valid
 *      dossier JSON containing the seeded lesson),
 *   3. wipe localStorage,
 *   4. import the captured file via the hidden file input,
 *   5. assert the lesson reappears in localStorage and the UI reflects it.
 */

const PROGRESS_KEY = 'discammer:progress:v1';

function seededProgress() {
  return JSON.stringify({
    modules: { 'threat-fundamentals': { lessons: { 'attack-vectors': true } } },
  });
}

// The export button is the one labelled with the export action; match by the
// EXPORT/ЭКСПОРТ-style mono label via its accessible role + text fallback.
function exportButton(page: import('@playwright/test').Page) {
  // The export button is labelled EXPORT_DOSSIER in both locales (the action
  // verb is not localized — only the toast copy is).
  return page.getByRole('button', { name: /export_dossier/i }).first();
}

test('export downloads a valid dossier, and import restores wiped progress', async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PROGRESS_KEY, seededProgress()],
  );

  await page.goto('/en/course');
  // Ensure the dossier footer (part of CourseProgress) has hydrated.
  const btn = exportButton(page);
  await expect(btn).toBeVisible({ timeout: 10_000 });

  // --- EXPORT: capture the download ---------------------------------------
  const [download] = await Promise.all([page.waitForEvent('download'), btn.click()]);

  // Filename pattern: discammer-progress-YYYYMMDD.json
  expect(download.suggestedFilename()).toMatch(/^discammer-progress-\d{8}\.json$/);

  const downloadPath = await download.path();
  expect(downloadPath, 'no download path').toBeTruthy();
  const dossierRaw = readFileSync(downloadPath!, 'utf-8');
  const dossier = JSON.parse(dossierRaw);

  // The dossier is a versioned snapshot carrying the seeded lesson. v5/F1
  // bumped the dossier to v:2 (adds guideChecks; the importer stays
  // backward-compatible with v:1 files).
  expect(dossier.v).toBe(2);
  expect(dossier.lessons?.['threat-fundamentals']?.lessons?.['attack-vectors']).toBe(true);

  // --- WIPE localStorage ---------------------------------------------------
  await page.evaluate(() => localStorage.clear());
  const afterWipe = await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);
  expect(afterWipe).toBeNull();

  // --- IMPORT: drive the hidden file input with the captured dossier -------
  // The import <input type="file"> is sr-only; set files directly on it.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(dossierRaw, 'utf-8'),
  });

  // The merge writes back to localStorage. Poll until the lesson reappears.
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);
        if (!raw) return false;
        try {
          return (
            JSON.parse(raw)?.modules?.['threat-fundamentals']?.lessons?.['attack-vectors'] === true
          );
        } catch {
          return false;
        }
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  // A polite import toast confirms the merge in the UI. EN: "// dossier merged: +N",
  // RU: "// досье объединено: +N".
  await expect(page.getByText(/dossier merged|досье объединено/i).first()).toBeVisible({
    timeout: 5_000,
  });
});
