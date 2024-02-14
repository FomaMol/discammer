import { useEffect, useState } from 'react';
import { fetchGuides } from '../utils/api';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

interface Guide {
  id: string;
  title: string;
  slug?: string;
  icon_color?: string;
}

interface ScamTypesGridProps {
  title: string;
  lang?: Locale;
}

const BUNDLES = {
  en: { loading: 'Loading guides...', empty: '> No threats indexed.', read: 'READ →' },
  ru: { loading: 'Загрузка гайдов...', empty: '> Угрозы пока не проиндексированы.', read: 'ЧИТАТЬ →' },
} as const;

const ICON_COLORS = [
  'bg-accent-cyan', 'bg-accent-green', 'bg-accent-red', 'bg-accent-amber',
  'bg-accent-cyan', 'bg-accent-green', 'bg-accent-red', 'bg-accent-amber',
  'bg-accent-cyan', 'bg-accent-green',
];

export default function ScamTypesGrid({ title, lang }: ScamTypesGridProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator(locale, BUNDLES);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchGuides(locale)
      .then((data) => {
        const arr: Guide[] = Array.isArray(data) ? data : [];
        setGuides(arr.filter((g) => !!g.slug).slice(0, 10));
      })
      .catch(() => setGuides([]))
      .finally(() => setIsLoading(false));
  }, [locale]);

  return (
    <section className="py-6 sm:py-8">
      <h2
        className="text-base sm:text-xl md:text-2xl text-accent-cyan glow-cyan mb-4 sm:mb-6"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
      >
        <span className="text-text-muted">&gt;&nbsp;</span>
        {title}
      </h2>

      <div
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {guides.map((guide, i) => (
          <a
            key={guide.id}
            href={`/${locale}/guide/${guide.slug}`}
            className="flex-shrink-0 w-32 sm:w-40 bg-bg-panel border border-border-default rounded-md p-3 sm:p-4 hover:border-accent-cyan hover:box-glow-cyan transition-all duration-300 group flex flex-col items-center text-center"
          >
            {/* Icon placeholder */}
            <div
              className={`w-12 h-12 ${ICON_COLORS[i % ICON_COLORS.length]} rounded flex items-center justify-center mb-3 opacity-80 group-hover:opacity-100 transition-opacity`}
            >
              <span
                className="text-bg-primary text-lg font-bold"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {guide.title.charAt(0).toUpperCase()}
              </span>
            </div>

            <h3
              className="text-text-primary text-xs mb-3 line-clamp-2 leading-relaxed"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {guide.title}
            </h3>

            <span className="text-accent-cyan text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
              {tr('read')}
            </span>
          </a>
        ))}

        {guides.length === 0 && (
          <div className="w-full py-8 text-center text-text-muted text-sm">
            {isLoading ? tr('loading') : tr('empty')}
          </div>
        )}
      </div>
    </section>
  );
}
