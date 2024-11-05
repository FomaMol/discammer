import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Every v2 user-facing PROSE string must exist in both locales AND be actually
 * translated (authored RU, not a literal copy of EN). scripts/i18n_audit.py
 * already enforces key parity; this guards the harder property — that the v2
 * prose keys aren't byte-identical EN/RU (which would mean an untranslated string
 * shipped). We check only known-prose key patterns to avoid false positives on
 * legitimately-identical tokens (brand names, codes, numbers).
 */

function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v as Record<string, unknown>, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

const load = (lang: string) =>
  flatten(
    JSON.parse(
      fs.readFileSync(path.join(HERE, `../backend/locales/${lang}.json`), 'utf8'),
    ) as Record<string, unknown>,
  );

const EN = load('en');
const RU = load('ru');

// v2 prose key patterns — definitely-translated user-facing strings.
const PROSE_PATTERNS: RegExp[] = [
  /(^|\.)home\.ways_(learn|check|practice)_(verb|line|cta)$/,
  /(^|\.)home\.ways_eyebrow$/,
  /(^|\.)checker\.(privacy|placeholder|clean|awaiting|inspect_link)$/,
  /(^|\.)checker\.lvl_[1-5]$/,
  /(^|\.)threat\.lvl_[1-5]$/,
  /(^|\.)inspect\.(privacy|clean_heading|clean_body|empty_prompt|input_label)$/,
];

test('v2 prose keys exist in EN+RU and are actually translated (not identical)', () => {
  const checked: string[] = [];
  const missing: string[] = [];
  const identical: string[] = [];

  for (const key of Object.keys(EN)) {
    if (!PROSE_PATTERNS.some((re) => re.test(key))) continue;
    checked.push(key);
    if (!(key in RU)) {
      missing.push(key);
      continue;
    }
    const en = EN[key];
    if (typeof en === 'string' && en.trim() === String(RU[key]).trim()) identical.push(key);
  }

  // Guard against the patterns silently matching nothing (locale structure drift).
  expect(checked.length, 'no v2 prose keys matched — patterns or locale structure drifted').toBeGreaterThan(10);
  expect(missing, `v2 prose keys missing from ru.json:\n${missing.join('\n')}`).toEqual([]);
  expect(identical, `v2 prose keys identical EN/RU (untranslated):\n${identical.join('\n')}`).toEqual([]);
});
