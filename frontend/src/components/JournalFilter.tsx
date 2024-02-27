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
    guide_badge: 'GUIDE',
    loading: '> Loading...',
    empty: '> No entries found for this filter.',
  },
  ru: {
    ALL: 'ВСЁ',
    INTERVIEW: 'ИНТЕРВЬЮ',
    NEWSLETTER: 'РАССЫЛКА',
    ARTICLE: 'СТАТЬЯ',
    GUIDE: 'ГАЙДЫ ПО МОШЕННИКАМ',
    guide_badge: 'ГАЙД',
    loading: '> Загрузка...',
    empty: '> По этому фильтру ничего не найдено.',
  },
} as const;

const BADGE_STYLES: Record<string, string> = {
  interview: 'bg-[#65def0]/10 text-[#65def0] border-[#65def0]/40',
  newsletter: 'bg-[#7ce896]/10 text-[#7ce896] border-[#7ce896]/40',
  article: 'bg-[#f4b965]/10 text-[#f4b965] border-[#f4b965]/40',
  guide: 'bg-[#e76670]/10 text-[#e76670] border-[#e76670]/40',
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
    if (lower === 'guide') return tr('guide_badge');
    return type;
  }

  return (
    <section className="py-6 sm:py-8">
      {/* Section index — numbered tab strip wrapped in a hairline top + bottom rule.
          Active section gets a cyan 2px underline + a ↓ glyph; inactive sit in ink-soft.
          See JournalBroadsheet.tsx for the canonical version — this kept in sync
          so existing mount points don't visually drift. */}
      <div
        role="tablist"
        aria-label="Journal sections"
        className="border-y border-[#202a44] py-3 mb-6 sm:mb-8 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex items-center gap-3 sm:gap-5 min-w-max">
          {FILTER_KEYS.map((key, idx) => {
            const isActive = activeTab === key;
            const num = String(idx + 1).padStart(2, '0');
            return (
              <div key={key} className="flex items-center gap-3 sm:gap-5">
                {idx > 0 && (
                  <span className="font-mono text-[#3a8b9a] select-none" aria-hidden="true">·</span>
                )}
                <button
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(key)}
                  className={`inline-flex items-baseline gap-1.5 whitespace-nowrap transition-colors duration-200 font-mono text-[11px] uppercase ${
                    isActive ? 'text-[#65def0]' : 'text-[#aab2c4] hover:text-[#9eecf6]'
                  }`}
                  style={{
                    letterSpacing: '0.14em',
                    fontWeight: 600,
                    borderBottom: isActive ? '2px solid #65def0' : '2px solid transparent',
                    paddingBottom: '4px',
                  }}
                >
                  <span className="text-[#6b7588] tabular-nums">{num}.</span>
                  <span>{tr(key)}</span>
                  {isActive && (
                    <span aria-hidden="true" className="ml-0.5 text-[#65def0]">↓</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bento grid: first card on desktop is wide (col-span-2), rest are 3-up.
          Avoids the 'three equal cards repeated endlessly' AI tell per DESIGN.md bans. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {filtered.map((item, idx) => {
          const hasImage = !!item.cover_image;
          const isFeatured = idx === 0 && filtered.length > 1;
          const href = item.slug
            ? item.type === 'guide'
              ? `/${locale}/guide/${item.slug}`
              : `/${locale}/journal/${item.slug}`
            : '#';
          return (
            <a
              key={`${item.type}-${item.id}`}
              href={href}
              className={`group flex flex-col overflow-hidden rounded-md transition-colors duration-300 ${
                isFeatured
                  ? 'sm:col-span-2 lg:col-span-2 bg-[#1a2236] border border-[#3a8b9a] hover:border-[#65def0] hover:box-glow-cyan'
                  : 'bg-[#121828] border border-[#202a44] hover:border-[#3a8b9a] hover:bg-[#1a2236]'
              }`}
              style={{ textDecoration: 'none' }}
            >
              {hasImage && (
                <div
                  className={`relative bg-[#0a0d16] overflow-hidden ${
                    isFeatured ? 'aspect-[16/9] lg:aspect-[21/9]' : 'aspect-video'
                  }`}
                >
                  <img
                    src={item.cover_image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500"
                    style={{ filter: 'saturate(0.85) contrast(1.05)' }}
                    loading="lazy"
                  />
                  <span
                    className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] uppercase border rounded-sm ${badgeClass(item.type)}`}
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      letterSpacing: '0.14em',
                      fontWeight: 600,
                    }}
                  >
                    {localizedBadge(item.type)}
                  </span>
                </div>
              )}

              <div className={`flex flex-col gap-2 flex-1 ${isFeatured ? 'p-5 sm:p-6' : 'p-4'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {!hasImage && (
                    <span
                      className={`px-2 py-0.5 text-[10px] uppercase border rounded-sm ${badgeClass(item.type)}`}
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        letterSpacing: '0.14em',
                        fontWeight: 600,
                      }}
                    >
                      {localizedBadge(item.type)}
                    </span>
                  )}
                  {item.published_at && (
                    <time
                      className="text-[11px] text-[#6b7588] tabular-nums"
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {item.published_at}
                    </time>
                  )}
                </div>
                <h3
                  className={`text-[#e7ecf5] font-bold leading-snug line-clamp-2 group-hover:text-[#65def0] transition-colors ${
                    isFeatured ? 'text-base sm:text-lg lg:text-xl' : 'text-sm'
                  }`}
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {item.title}
                </h3>
                {(item.subtitle || item.description) && (
                  <p
                    className={`text-[#aab2c4] leading-relaxed ${
                      isFeatured ? 'text-sm line-clamp-3 sm:line-clamp-4' : 'text-xs line-clamp-3'
                    }`}
                  >
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
          className="py-16 text-center text-[#6b7588] text-sm"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {isLoading ? tr('loading') : tr('empty')}
        </div>
      )}
    </section>
  );
}
