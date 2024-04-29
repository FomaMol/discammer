import { useEffect, useState, useRef } from 'react';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';
import { prefersReducedMotion } from '../utils/useReducedMotion';

interface CardData {
  id: number;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  cover_image?: string;
  published_at?: string;
  type?: string;
  guest_name?: string;
}

type CarouselVariant = 'default' | 'interview' | 'newsletter' | 'article';

interface ContentCarouselProps {
  title: string;
  apiUrl: string;
  badge: string;
  lang?: Locale;
  variant?: CarouselVariant;
}

const BADGE_COLORS: Record<string, string> = {
  INTERVIEW: 'bg-[#65def0]/15 text-[#65def0] border-[#65def0]/40',
  NEWSLETTER: 'bg-[#7ce896]/15 text-[#7ce896] border-[#7ce896]/40',
  ARTICLE: 'bg-[#f4b965]/15 text-[#f4b965] border-[#f4b965]/40',
  'ИНТЕРВЬЮ': 'bg-[#65def0]/15 text-[#65def0] border-[#65def0]/40',
  'РАССЫЛКА': 'bg-[#7ce896]/15 text-[#7ce896] border-[#7ce896]/40',
  'СТАТЬЯ': 'bg-[#f4b965]/15 text-[#f4b965] border-[#f4b965]/40',
};

const BUNDLES = {
  en: {
    scroll_left: 'Scroll left',
    scroll_right: 'Scroll right',
    loading: 'Loading data...',
    empty: '> No entries available.',
    dispatch: 'DISPATCH',
    field_note: 'FIELD NOTE',
  },
  ru: {
    scroll_left: 'Прокрутить влево',
    scroll_right: 'Прокрутить вправо',
    loading: 'Загрузка...',
    empty: '> Записей пока нет.',
    dispatch: 'СВОДКА',
    field_note: 'ПОЛЕВАЯ ЗАМЕТКА',
  },
} as const;

function initials(s: string | undefined): string {
  if (!s) return '?';
  return s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function extractGuestFromTitle(title: string): string | null {
  // Title patterns: "Interview: Person Name", "Person Name — Topic", etc.
  // Heuristic: if title contains an em-like separator or "Interview", grab
  // the segment before/after.
  const m = title.match(/(?:Interview|Интервью)[\s:—–-]+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  return null;
}

export default function ContentCarousel({
  title,
  apiUrl,
  badge,
  lang,
  variant = 'default',
}: ContentCarouselProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator(locale, BUNDLES);
  const [items, setItems] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  function scroll(direction: 'left' | 'right') {
    const container = scrollRef.current;
    if (!container) return;
    const first = container.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(container).columnGap || '0') || 0;
    const step = first ? first.offsetWidth + gap : container.clientWidth;
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  const colorClass = BADGE_COLORS[badge] || BADGE_COLORS.INTERVIEW;

  // Unicode-aware slug: \W collapses Cyrillic titles to identical ids,
  // breaking aria-labelledby/aria-controls on RU pages (HTML5 ids may
  // contain non-ASCII letters).
  const carouselId = `carousel-${title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`;
  const trackId = `${carouselId}-track`;

  return (
    <section
      className="py-6 sm:py-8"
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={carouselId}
    >
      {/* Section title strip */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <h2
          id={carouselId}
          className="text-base sm:text-xl md:text-2xl truncate"
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            color: '#65def0',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <span className="text-[#475064]" aria-hidden="true">&gt;&nbsp;</span>
          {title}
        </h2>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="w-9 h-9 sm:w-10 sm:h-10 border border-[#202a44] bg-[#0b0f1a] text-[#aab2c4] hover:text-[#65def0] hover:border-[#65def0] transition-colors flex items-center justify-center"
            aria-label={`${tr('scroll_left')}: ${title}`}
            aria-controls={trackId}
          >
            <span aria-hidden="true">&#8592;</span>
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="w-9 h-9 sm:w-10 sm:h-10 border border-[#202a44] bg-[#0b0f1a] text-[#aab2c4] hover:text-[#65def0] hover:border-[#65def0] transition-colors flex items-center justify-center"
            aria-label={`${tr('scroll_right')}: ${title}`}
            aria-controls={trackId}
          >
            <span aria-hidden="true">&#8594;</span>
          </button>
        </div>
      </div>

      {/* Carousel — keyboard users can also Tab through cards directly. */}
      <div
        ref={scrollRef}
        id={trackId}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0"
        style={{ scrollbarWidth: 'none' }}
        tabIndex={0}
        aria-label={title}
      >
        {items.map((item) => {
          const href = `/${locale}/journal/${item.slug}`;

          // ----- INTERVIEW variant: portrait-prominent + quote treatment -----
          if (variant === 'interview') {
            const guest = item.guest_name || extractGuestFromTitle(item.title) || item.title.split(/[:—–-]/)[0].trim();
            const quote = item.subtitle || item.title;
            return (
              <a
                key={item.id}
                href={href}
                className="card-interactive flex-shrink-0 w-[78vw] sm:w-[300px] md:w-[320px] lg:w-[calc(33.333%-12px)] max-w-[360px] bg-[#121828] border border-[#202a44] overflow-hidden snap-start group block"
                style={{ textDecoration: 'none' }}
                aria-label={`${badge}: ${item.title}`}
              >
                {/* Square portrait, large */}
                <div className="relative aspect-square bg-[#0a0d16] overflow-hidden">
                  {item.cover_image && item.cover_image !== '' ? (
                    <img
                      src={item.cover_image}
                      alt={guest}
                      className="w-full h-full object-cover grayscale-[0.15] contrast-[1.05] saturate-[0.85] group-hover:saturate-100 group-hover:grayscale-0 transition-all duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#0a0d16]">
                      <span
                        className="text-5xl text-[#65def0]/30"
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}
                      >
                        {initials(guest)}
                      </span>
                    </div>
                  )}
                  <span
                    className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] uppercase tracking-[2px] border ${colorClass}`}
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {badge}
                  </span>
                  {item.published_at && (
                    <time
                      className="absolute bottom-2 right-2 px-2 py-0.5 text-[10px] uppercase tracking-[2px] tabular-nums text-[#aab2c4] bg-[#0a0d16]/80"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {item.published_at}
                    </time>
                  )}
                </div>

                {/* Quote treatment */}
                <div className="p-4">
                  <p
                    className="text-[13px] leading-snug italic text-[#e7ecf5] line-clamp-3"
                    style={{ fontFamily: 'Geist, system-ui, sans-serif' }}
                  >
                    &ldquo;{quote}&rdquo;
                  </p>
                  <p
                    className="mt-2 text-[11px] uppercase tracking-[2px] text-[#aab2c4]"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    <span className="text-[#475064]">&mdash; </span>{guest}
                  </p>
                </div>
              </a>
            );
          }

          // ----- NEWSLETTER variant: wire-service horizontal compact -----
          if (variant === 'newsletter') {
            const dateline = (item.published_at || '').toUpperCase();
            return (
              <a
                key={item.id}
                href={href}
                className="card-interactive flex-shrink-0 w-[78vw] sm:w-[320px] md:w-[360px] lg:w-[calc(33.333%-12px)] max-w-[420px] bg-[#121828] border border-[#202a44] overflow-hidden snap-start group block"
                style={{ textDecoration: 'none' }}
                aria-label={`${tr('dispatch')}: ${item.title}`}
              >
                <div className="p-4 sm:p-5">
                  {/* Wire-service dateline */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dashed border-[#202a44]">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] uppercase tracking-[2px] border ${colorClass}`}
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {tr('dispatch')}
                    </span>
                    {dateline && (
                      <time
                        className="text-[10px] uppercase tracking-[2px] tabular-nums text-[#7ce896]"
                        style={{ fontFamily: '"JetBrains Mono", monospace' }}
                      >
                        {dateline}
                      </time>
                    )}
                  </div>
                  <h3
                    className="text-[15px] leading-snug font-semibold text-[#f3f5fa] line-clamp-2"
                    style={{ fontFamily: '"JetBrains Mono", monospace', letterSpacing: '-0.01em' }}
                  >
                    {item.title}
                  </h3>
                  {item.subtitle && (
                    <p
                      className="mt-2 text-[13px] leading-relaxed text-[#aab2c4] line-clamp-1"
                      style={{ fontFamily: 'Geist, system-ui, sans-serif' }}
                    >
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </a>
            );
          }

          // ----- ARTICLE variant: editorial, cover left 40%, title large -----
          if (variant === 'article') {
            return (
              <a
                key={item.id}
                href={href}
                className="card-interactive flex-shrink-0 w-[78vw] sm:w-[340px] md:w-[400px] lg:w-[calc(33.333%-12px)] max-w-[480px] bg-[#121828] border border-[#202a44] overflow-hidden snap-start group block"
                style={{ textDecoration: 'none' }}
                aria-label={`${tr('field_note')}: ${item.title}`}
              >
                <div className="flex gap-3 p-3">
                  {/* Left: cover, 40% */}
                  <div className="relative w-[40%] aspect-[4/5] bg-[#0a0d16] overflow-hidden flex-shrink-0">
                    {item.cover_image && item.cover_image !== '' ? (
                      <img
                        src={item.cover_image}
                        alt={item.title}
                        className="w-full h-full object-cover saturate-[0.85] contrast-[1.05] group-hover:saturate-100 transition-all duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#0a0d16]">
                        <span
                          className="text-4xl text-[#f4b965]/30"
                          style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}
                        >
                          {item.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: editorial content */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span
                      className={`self-start px-1.5 py-0.5 text-[10px] uppercase tracking-[2px] border ${colorClass} mb-2`}
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {tr('field_note')}
                    </span>
                    <h3
                      className="text-[17px] sm:text-[19px] leading-tight text-[#f3f5fa] line-clamp-3"
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {item.title}
                    </h3>
                    {item.published_at && (
                      <time
                        className="mt-auto pt-2 text-[10px] uppercase tracking-[2px] text-[#f4b965] tabular-nums"
                        style={{ fontFamily: '"JetBrains Mono", monospace' }}
                      >
                        {item.published_at}
                      </time>
                    )}
                  </div>
                </div>
              </a>
            );
          }

          // ----- DEFAULT variant (preserved for other callers) -----
          return (
            <a
              key={item.id}
              href={href}
              className="card-interactive flex-shrink-0 w-[78vw] sm:w-[280px] md:w-[300px] lg:w-[calc(25%-12px)] max-w-[320px] bg-[#121828] border border-[#202a44] overflow-hidden snap-start group block"
              style={{ textDecoration: 'none' }}
              aria-label={`${badge}: ${item.title}`}
            >
              <div className="relative aspect-video bg-[#0b0f1a] overflow-hidden">
                {item.cover_image && item.cover_image !== '' ? (
                  <img
                    src={item.cover_image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: '#6b7588' }}>
                    <span className="text-3xl opacity-30" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      ?
                    </span>
                  </div>
                )}
                <span
                  className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] uppercase tracking-wider border ${colorClass}`}
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  {badge}
                </span>
              </div>
              <div className="p-4">
                {item.published_at && (
                  <time
                    className="block text-xs mb-1"
                    style={{ fontFamily: '"JetBrains Mono", monospace', color: '#f4b965' }}
                  >
                    {item.published_at}
                  </time>
                )}
                <h3 className="text-sm font-semibold mb-1 line-clamp-2" style={{ color: '#e7ecf5' }}>
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-xs line-clamp-2" style={{ color: '#aab2c4' }}>
                    {item.subtitle}
                  </p>
                )}
              </div>
            </a>
          );
        })}

        {items.length === 0 && (
          <div className="w-full py-12 text-center text-sm" style={{ color: '#6b7588' }}>
            {isLoading ? tr('loading') : tr('empty')}
          </div>
        )}
      </div>
    </section>
  );
}
