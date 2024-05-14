import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';

interface Props {
  locale?: Locale;
  /** Optional explicit objective lines. If empty, falls back to a generic set. */
  objectives?: string[];
  /** Module title — used as a fallback narrative for the first generic objective. */
  moduleTitle?: string;
}

/**
 * Objectives panel — terminal-style panel on module pages that frames the
 * module as a set of operator objectives. When the module record has an
 * explicit objectives list, it is rendered verbatim. Otherwise a generic
 * three-line "operator objective" is used.
 */
export default function ObjectivesPanel({ locale, objectives, moduleTitle }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('objectives');

  const heading = tr('heading');
  const subtitle = tr('subtitle');

  // Generic fallback objectives if the module record has none.
  const fallbackRecognize = moduleTitle && lang === 'en'
    ? tr('fallback_recognize_with_title', { title: moduleTitle.toLowerCase() })
    : tr('fallback_recognize_generic');
  const fallbackIdentify = tr('fallback_identify');
  const fallbackPass = tr('fallback_pass');

  const items =
    objectives && objectives.length > 0
      ? objectives
      : [fallbackRecognize, fallbackIdentify, fallbackPass];

  return (
    <section
      className="bg-[#121828] border border-[#202a44] rounded-[4px] overflow-hidden"
      aria-label="Module objectives"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#202a44] bg-[#1a2236]/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
          <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
          <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
          <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[#65def0]">
            {heading}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] hidden sm:inline">
          {subtitle}
        </span>
      </header>
      <ul className="px-4 sm:px-6 py-4 sm:py-5 space-y-2">
        {items.map((line, i) => (
          <li
            key={i}
            className="flex items-start gap-3 font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.06em] leading-[1.7] text-[#cdd4e3]"
          >
            <span className="text-[#f4b965] shrink-0 font-bold" aria-hidden="true">
              ▸
            </span>
            <span className="flex-1 break-words">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
