/**
 * Lightweight i18n helper for the islands bundle.
 *
 * The server injects ``window.__DISCAMMER_I18N__ = { lang, otherLang, switchUrl }``
 * in base.html, and also sets ``<body data-lang="en|ru">`` so components can
 * pick up the active locale without props plumbing.
 *
 * Translations themselves are bundled with the JS rather than fetched, because
 * the strings live in a handful of components — duplicating them in both
 * locales costs less than the round-trip to the server.
 */

export type Locale = 'en' | 'ru';

declare global {
  interface Window {
    __DISCAMMER_I18N__?: {
      lang?: Locale;
      otherLang?: Locale;
      switchUrl?: string;
    };
  }
}

const DEFAULT_LANG: Locale = 'en';

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === 'ru' ? 'ru' : 'en';
}

/** Resolve the active locale from an explicit hint, body[data-lang], or the global. */
export function currentLang(explicit?: string | null): Locale {
  if (explicit === 'en' || explicit === 'ru') return explicit;
  if (typeof document !== 'undefined') {
    const attr = document.body?.dataset?.lang;
    if (attr === 'en' || attr === 'ru') return attr;
  }
  const g =
    typeof window !== 'undefined' ? window.__DISCAMMER_I18N__?.lang : undefined;
  if (g === 'en' || g === 'ru') return g;
  return DEFAULT_LANG;
}

/**
 * Compact translation helper: pass a record keyed by locale and get the entry
 * for the active locale, falling back to English if a translation is missing.
 */
export function t<T>(strings: Partial<Record<Locale, T>>, locale: Locale): T {
  return (strings[locale] ?? strings.en) as T;
}

/** ``pick(lang, { en: 'Hi', ru: 'Привет' })`` — sugar for one-off label pairs. */
export function pick<T>(locale: Locale, bundle: Record<Locale, T>): T {
  return bundle[locale] ?? bundle.en;
}

/**
 * Build a translator from a static bundle keyed by locale-first.
 *
 *   const tr = makeTranslator(locale, {
 *     en: { loading: 'Loading…', empty: 'Nothing yet.' },
 *     ru: { loading: 'Загрузка…', empty: 'Пока пусто.' },
 *   });
 *   tr('loading');
 */
export function makeTranslator<K extends string>(
  locale: Locale,
  bundles: Record<Locale, Record<K, string>>,
): (key: K, vars?: Record<string, string | number>) => string {
  const table = bundles[locale] ?? bundles.en;
  const fallback = bundles.en;
  return (key, vars) => {
    let value: string = table[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        // Function replacement so `$&`/`$'` in values aren't treated as patterns.
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v));
      }
    }
    return value;
  };
}

/**
 * Inline-record translation bundles shared across components.
 * Keep these compact — anything more elaborate belongs in the per-component
 * translator factory.
 */
export const STRINGS = {
  completed: { en: 'Completed', ru: 'Пройден' },
  estMinutes: { en: 'min', ru: 'мин' },
};
