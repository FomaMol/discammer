import { useEffect, useMemo, useState } from 'react';
import { fetchPosts, fetchGuides } from '../utils/api';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

interface Item {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  cover_image?: string;
  published_at?: string;
  type: string;
  slug: string;
}

type FilterKey = 'ALL' | 'INTERVIEW' | 'NEWSLETTER' | 'ARTICLE' | 'GUIDE';

const FILTER_KEYS: FilterKey[] = ['ALL', 'INTERVIEW', 'NEWSLETTER', 'ARTICLE', 'GUIDE'];

const BUNDLES = {
  en: {
    ALL: 'ALL',
    INTERVIEW: 'INTERVIEW',
    NEWSLETTER: 'NEWSLETTER',
    ARTICLE: 'ARTICLE',
    GUIDE: 'SCAM GUIDES',
    loading: '> Loading...',
    empty: '> No entries found for this filter.',
  },
  ru: {
    ALL: 'ВСЁ',
    INTERVIEW: 'ИНТЕРВЬЮ',
    NEWSLETTER: 'РАССЫЛКА',
    ARTICLE: 'СТАТЬЯ',
    GUIDE: 'ГАЙДЫ ПО МОШЕННИКАМ',
    loading: '> Загрузка...',
    empty: '> По этому фильтру ничего не найдено.',
  },
} as const;

const BADGE_STYLES: Record<string, string> = {
  interview: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
  newsletter: 'bg-accent-green/20 text-accent-green border-accent-green/30',
  article: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  guide: 'bg-accent-red/20 text-accent-red border-accent-red/30',
};

function badgeClass(type: string): string {
  return BADGE_STYLES[type.toLowerCase()] || BADGE_STYLES.article;
}

interface JournalFilterProps {
  lang?: Locale;
}

export default function JournalFilter({ lang }: JournalFilterProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator(locale, BUNDLES);

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterKey>('ALL');

  useEffect(() => {
    Promise.all([
      fetchPosts(undefined, undefined, locale).then((data) => {
        const arr: Item[] = Array.isArray(data) ? data : [];
        return arr.map((i) => ({ ...i, type: i.type || 'article' }));
      }),
      fetchGuides(locale).then((data) => {
        const arr: Item[] = Array.isArray(data) ? data : [];
        return arr.map((i) => ({ ...i, type: 'guide' }));
      }),
    ])
      .then(([posts, guides]) => setItems([...posts, ...guides]))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [locale]);

  const filtered = useMemo(() => {
    const tabToType: Record<FilterKey, string | null> = {
      ALL: null,
      INTERVIEW: 'interview',
      NEWSLETTER: 'newsletter',
      ARTICLE: 'article',
      GUIDE: 'guide',
    };
    const target = tabToType[activeTab];
    if (!target) return items;
    return items.filter((i) => i.type.toLowerCase() === target);
  }, [items, activeTab]);

  function localizedBadge(type: string): string {
    const lower = type.toLowerCase();
    if (lower === 'interview') return tr('INTERVIEW');
    if (lower === 'newsletter') return tr('NEWSLETTER');
    if (lower === 'article') return tr('ARTICLE');
    if (lower === 'guide') return locale === 'ru' ? 'ГАЙД' : 'GUIDE';
    return type;
  }

  return (
    <section className="py-6 sm:py-8">
      {/* Tabs */}
      <div
        className="flex gap-1 mb-6 sm:mb-8 overflow-x-auto pb-2 scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs uppercase tracking-wider border whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${activeTab === key
                ? 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan glow-cyan'
                : 'bg-bg-panel text-text-secondary border-border-default hover:text-text-primary hover:border-text-muted'
              }`}
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            [{tr(key)}]
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => {
          const hasImage = !!item.cover_image;
          const href = item.slug
            ? item.type === 'guide'
              ? `/${locale}/guide/${item.slug}`
              : `/${locale}/journal/${item.slug}`
            : '#';
          return (
            <a
              key={`${item.type}-${item.id}`}
              href={href}
              className="bg-bg-panel border border-border-default rounded-md overflow-hidden hover:border-accent-cyan-dim hover:box-glow-cyan transition-all duration-300 group flex flex-col"
              style={{ textDecoration: 'none' }}
            >
              {/* Image (only when cover_image is set) */}
              {hasImage && (
                <div className="relative aspect-video bg-bg-secondary overflow-hidden">
                  <img
                    src={item.cover_image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <span
                    className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded ${badgeClass(item.type)}`}
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {localizedBadge(item.type)}
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {!hasImage && (
                    <span
                      className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded ${badgeClass(item.type)}`}
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {localizedBadge(item.type)}
                    </span>
                  )}
                  {item.published_at && (
                    <time
                      className="text-xs text-accent-amber"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {item.published_at}
                    </time>
                  )}
                </div>
                <h3 className="text-text-primary text-sm font-semibold line-clamp-2 leading-snug">
                  {item.title}
                </h3>
                {(item.subtitle || item.description) && (
                  <p className="text-text-secondary text-xs line-clamp-3 leading-relaxed">
                    {item.subtitle || item.description}
                  </p>
                )}
              </div>
            </a>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div
          className="py-16 text-center text-text-muted text-sm"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {isLoading ? tr('loading') : tr('empty')}
        </div>
      )}
    </section>
  );
}
