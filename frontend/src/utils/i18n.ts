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
export type Lang = Locale;

declare global {
  interface Window {
    __DISCAMMER_I18N__?: {
      lang?: Locale;
      otherLang?: Locale;
      switchUrl?: string;
    };
  }
}

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ru'];
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
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return value;
  };
}

/** Build a localised app URL like ``/en/journal`` or ``/ru/journal``. */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `/${locale}/${clean}`;
}

/**
 * Inline-record translation bundles used by multiple components.
 * Keep these compact — anything more elaborate belongs in the per-component
 * translator factory.
 */
export const STRINGS = {
  // Used across the lesson player UI.
  markComplete: { en: 'Mark complete', ru: 'Отметить как пройденный' },
  completed: { en: 'Completed', ru: 'Пройден' },
  prev: { en: 'Prev', ru: 'Назад' },
  next: { en: 'Next', ru: 'Дальше' },
  module: { en: 'Module', ru: 'Модуль' },
  lessons: { en: 'lessons', ru: 'уроков' },
  startLesson: { en: 'Start lesson', ru: 'Начать урок' },
  continueLesson: { en: 'Continue', ru: 'Продолжить' },
  resetProgress: { en: 'Reset progress', ru: 'Сбросить прогресс' },
  quizCheck: { en: 'Check answer', ru: 'Проверить ответ' },
  quizTryAgain: { en: 'Try again', ru: 'Попробовать снова' },
  quizCorrect: { en: 'Correct', ru: 'Верно' },
  quizWrong: { en: 'Not quite', ru: 'Не совсем' },
  estMinutes: { en: 'min', ru: 'мин' },
  finishModule: { en: 'Finish module', ru: 'Завершить модуль' },
};
