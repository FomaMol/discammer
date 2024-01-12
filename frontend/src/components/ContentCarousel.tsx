import { useEffect, useState, useRef } from 'react';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

interface CardData {
  id: number;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  cover_image?: string;
  published_at?: string;
  type?: string;
}

interface ContentCarouselProps {
  title: string;
  apiUrl: string;
  badge: string;
  lang?: Locale;
}

const BADGE_COLORS: Record<string, string> = {
  INTERVIEW: 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30',
  NEWSLETTER: 'bg-[#39FF6B]/20 text-[#39FF6B] border-[#39FF6B]/30',
  ARTICLE: 'bg-[#FFB547]/20 text-[#FFB547] border-[#FFB547]/30',
  ИНТЕРВЬЮ: 'bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30',
  РАССЫЛКА: 'bg-[#39FF6B]/20 text-[#39FF6B] border-[#39FF6B]/30',
  СТАТЬЯ: 'bg-[#FFB547]/20 text-[#FFB547] border-[#FFB547]/30',
};

const BUNDLES = {
  en: {
    scroll_left: 'Scroll left',
    scroll_right: 'Scroll right',
    loading: 'Loading data...',
    empty: '> No entries available.',
  },
  ru: {
    scroll_left: 'Прокрутить влево',
    scroll_right: 'Прокрутить вправо',
    loading: 'Загрузка...',
    empty: '> Записей пока нет.',
  },
} as const;

export default function ContentCarousel({ title, apiUrl, badge, lang }: ContentCarouselProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator(locale, BUNDLES);
  const [items, setItems] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false));
  }, [apiUrl]);

  function scroll(direction: 'left' | 'right') {
    const container = scrollRef.current;
    if (!container) return;
    const first = container.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(container).columnGap || '0') || 0;
    const step = first ? first.offsetWidth + gap : container.clientWidth;
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  }

  const colorClass = BADGE_COLORS[badge] || BADGE_COLORS.INTERVIEW;

  return (
    <section className="py-6 sm:py-8">
      {/* Section title */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <h2
          className="text-base sm:text-xl md:text-2xl glow-cyan truncate"
          style={{ fontFamily: '"JetBrains Mono", monospace', color: '#00F0FF' }}
        >
          {title}
        </h2>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => scroll('left')}
            className="w-9 h-9 sm:w-10 sm:h-10 border border-[#1E2A42] bg-[#1A2035] text-[#8892A8] hover:text-[#00F0FF] hover:border-[#00F0FF] transition-colors flex items-center justify-center"
            aria-label={tr('scroll_left')}
          >
            &#8592;
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-9 h-9 sm:w-10 sm:h-10 border border-[#1E2A42] bg-[#1A2035] text-[#8892A8] hover:text-[#00F0FF] hover:border-[#00F0FF] transition-colors flex items-center justify-center"
            aria-label={tr('scroll_right')}
          >
            &#8594;
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((item) => (
          <a
            key={item.id}
            href={`/${locale}/journal/${item.slug}`}
            className="flex-shrink-0 w-[78vw] sm:w-[280px] md:w-[300px] lg:w-[calc(25%-12px)] max-w-[320px] bg-[#131829] border border-[#1E2A42] overflow-hidden hover:border-[#0A8F99] transition-all duration-300 snap-start group block"
            style={{ textDecoration: 'none' }}
          >
            {/* Image */}
            <div className="relative aspect-video bg-[#0B0E17] overflow-hidden">
              {item.cover_image && item.cover_image !== '' ? (
                <img
                  src={item.cover_image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ color: '#4A5568' }}>
                  <span
                    className="text-3xl opacity-30"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    ?
                  </span>
                </div>
              )}
              <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] uppercase tracking-wider border ${colorClass}`}
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {badge}
              </span>
            </div>

            {/* Content */}
            <div className="p-4">
              {item.published_at && (
                <time
                  className="block text-xs mb-1"
                  style={{ fontFamily: '"JetBrains Mono", monospace', color: '#FFB547' }}
                >
                  {item.published_at}
                </time>
              )}
              <h3 className="text-sm font-semibold mb-1 line-clamp-2" style={{ color: '#E4E8F1' }}>
                {item.title}
              </h3>
              {item.subtitle && (
                <p className="text-xs line-clamp-2" style={{ color: '#8892A8' }}>
                  {item.subtitle}
                </p>
              )}
            </div>
          </a>
        ))}

        {items.length === 0 && (
          <div className="w-full py-12 text-center text-sm" style={{ color: '#4A5568' }}>
            {isLoading ? tr('loading') : tr('empty')}
          </div>
        )}
      </div>
    </section>
  );
}
