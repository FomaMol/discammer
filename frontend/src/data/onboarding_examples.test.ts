import { describe, expect, it } from 'vitest';
import enLocale from '../../../backend/locales/en.json';
import ruLocale from '../../../backend/locales/ru.json';
import { analyze } from './redflags';
import { inspect } from './url_heuristics';

/**
 * UX-2 onboarding guard — the "Load example" examples MUST actually trip the
 * engines, in BOTH languages.
 *
 * The MessageAnalyzer / LinkInspector each ship a "Load example" button whose
 * whole point is an instant "aha": one click fills the input with the localized
 * `client.analyzer.example` / `client.inspect.example` string and immediately
 * renders a non-empty verdict. If a future rules change (redflags.ts /
 * url_heuristics.ts) silently stopped matching those canned strings, the
 * onboarding button would demo "nothing fired" — the opposite of its purpose.
 *
 * This test reads the SAME strings the UI ships (straight from the backend
 * locale files the server serves to the islands, en + ru) and asserts each one
 * fires at least one flag/finding, so that regression can never land green.
 *
 * It is pure and offline: it only reads local JSON and runs the pure analyze()
 * / inspect() functions. Nothing is sent anywhere — the same privacy property
 * the runtime "Load example" click has.
 */

type LocaleTable = { client: Record<string, Record<string, unknown>> };

const LOCALES: Record<'en' | 'ru', LocaleTable> = {
  en: enLocale as unknown as LocaleTable,
  ru: ruLocale as unknown as LocaleTable,
};

/** Pull a client.<ns>.<key> string out of a locale file, asserting it exists. */
function clientString(locale: LocaleTable, ns: string, key: string): string {
  const value = locale.client?.[ns]?.[key];
  if (typeof value !== 'string') {
    throw new Error(`client.${ns}.${key} is missing or not a string`);
  }
  return value;
}

describe('UX-2 "Load example" onboarding examples fire the engine', () => {
  for (const lang of ['en', 'ru'] as const) {
    const locale = LOCALES[lang];

    it(`${lang}: analyzer example trips several red flags`, () => {
      const example = clientString(locale, 'analyzer', 'example');
      const result = analyze(example);
      // The onboarding "aha" needs a clearly non-empty, elevated read.
      expect(result.fired.length).toBeGreaterThanOrEqual(3);
      expect(result.level).toBeGreaterThan(0);
    });

    it(`${lang}: analyzer example has a load_example button label`, () => {
      expect(clientString(locale, 'analyzer', 'load_example').length).toBeGreaterThan(0);
    });

    it(`${lang}: inspector example trips URL findings`, () => {
      const example = clientString(locale, 'inspect', 'example');
      const result = inspect(example);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.level).toBeGreaterThan(0);
    });

    it(`${lang}: inspector example has a load_example button label`, () => {
      expect(clientString(locale, 'inspect', 'load_example').length).toBeGreaterThan(0);
    });
  }
});
