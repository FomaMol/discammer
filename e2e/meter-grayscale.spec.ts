import { test, expect } from '@playwright/test';
import { SCAM_FIXTURE } from './helpers';

/**
 * T1.5 — the threat meter must convey level by WORD + number, not hue alone, so
 * its meaning survives for color-blind users and in grayscale. We render the hero
 * checker's meter, assert the visible "LVL n/5 · WORD" label carries both the
 * number and a semantic word, then force a global grayscale filter and confirm
 * the label is still present (meaning is color-independent).
 */

const WORDS = /(LOW|GUARDED|ELEVATED|HIGH|CRITICAL)/;

test('threat meter reads "LVL n/5 · WORD" — survives grayscale (color is signal #3)', async ({
  page,
}) => {
  await page.goto('/en/');
  const checker = page.locator('[data-component="MessageChecker"]');
  await checker.locator('textarea').fill(SCAM_FIXTURE);

  const meter = checker.locator('[role="meter"]');
  await expect(meter).toBeVisible({ timeout: 5_000 });
  const level = Number(await meter.getAttribute('aria-valuenow'));
  expect(level).toBeGreaterThan(0);

  // The visible label next to the meter — number + word, in text (not just color).
  const label = checker.locator('[aria-live="polite"]').getByText(WORDS).first();
  await expect(label).toBeVisible();
  const text = await label.innerText();
  expect(text).toMatch(new RegExp(`LVL\\s*${level}\\s*/\\s*5`));
  expect(text).toMatch(WORDS);

  // Force grayscale: the meaning (number + word) must remain legible.
  await page.addStyleTag({ content: '*{filter:grayscale(1)!important}' });
  await expect(checker.locator('[aria-live="polite"]').getByText(WORDS).first()).toBeVisible();
});
