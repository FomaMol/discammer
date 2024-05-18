/**
 * Lightweight i18n helper for the islands bundle.
 *
 * The server injects, near the end of base.html,
 *
 *   window.__DISCAMMER_I18N__ = {
 *     lang, otherLang, switchUrl,
 *     strings: { <namespace>: { <key>: <value> } },   // already in the active locale
 *   }
 *
 * and sets ``<body data-lang="en|ru">`` so components can pick up the active
 * locale without props plumbing.
 *
 * Client-facing strings live in the ``client`` namespace of the backend locale
 * files (``backend/locales/{en,ru}.json``). The server resolves the active
 * locale and ships only that slice in ``strings`` — so the bundle is already
 * single-locale and components never carry their own translation tables.
 */

export type Locale = 'en' | 'ru';

/** A locale value is a leaf string or a nested group (e.g. `analyzer.flags.*`). */
type I18nNode = string | { [key: string]: I18nNode };

declare global {
  interface Window {
    __DISCAMMER_I18N__?: {
      lang?: Locale;
      otherLang?: Locale;
      switchUrl?: string;
      /** namespace → (possibly nested) keys, already resolved to the active locale. */
      strings?: Record<string, Record<string, I18nNode>>;
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
 * Build a translator bound to one ``client`` namespace.
 *
 *   const tr = makeTranslator('exam');
 *   tr('heading');
 *   tr('counts', { modules: 9, lessons: 42 });
 *
 * Lookups read ``window.__DISCAMMER_I18N__.strings[namespace][key]`` — the
 * server already resolved the active locale, so no locale argument is needed.
 * ``{var}`` placeholders are interpolated with a function replacement so ``$&``
 * / ``$'`` sequences in values aren't treated as regex backreferences. On a
 * miss the call warns once and returns the key so the UI degrades visibly
 * rather than rendering an empty string.
 */
export function makeTranslator(
  namespace: string,
): (key: string, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    const table =
      typeof window !== 'undefined'
        ? window.__DISCAMMER_I18N__?.strings?.[namespace]
        : undefined;
    // Walk dotted keys (e.g. 'flags.urgency_label') through nested groups, so a
    // grouped namespace like analyzer.flags.* resolves the same way a flat key
    // does. A single-segment key is just a one-step walk.
    let node: I18nNode | undefined = table;
    for (const seg of key.split('.')) {
      node = node !== undefined && node !== null && typeof node === 'object' ? node[seg] : undefined;
    }
    let value: string;
    if (typeof node === 'string') {
      value = node;
    } else {
      console.warn('[i18n] missing', namespace + '.' + key);
      value = key;
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        // Function replacement so `$&`/`$'` in values aren't treated as patterns.
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v));
      }
    }
    return value;
  };
}
