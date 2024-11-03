import { useEffect, useMemo, useState } from 'react';
import { fetchPosts, fetchGuides } from '../utils/api';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

/**
 * JournalBroadsheet — single React island that owns the entire post grid for
 * the journal page. Renders, in order:
 *
 *   1. Featured story (first post, 60/40 split image+text)
 *   2. Section index (numbered tab strip with active-section eyebrow)
 *   3. Zigzag pair grid (next 6 entries, alternating image-left/right)
 *   4. Compact list (everything remaining, no images)
 *
 * The server already renders these cards in the <noscript> fallback in
 * journal.html, so SEO + no-JS browsers still see content.
 */

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

/** Translator key type for the `client.journal` namespace — kept as a literal
 *  union so the sub-components' `tr` prop stays narrowly typed. */
type JournalKey =
  | FilterKey
  | 'guide_badge'
  | 'section_eyebrow'
  | 'loading'
  | 'empty'
  | 'featured_byline'
  | 'min_read'
  | 'skim_label'
  | 'skim_caption';

/** Per-type colors. Pulled inline (not class-name interpolation) so Tailwind v4
 *  doesn't see a dynamic class and tree-shake it. */
const TYPE_COLOR: Record<string, { fg: string; bg: string; border: string }> = {
  interview: { fg: '#65def0', bg: 'rgba(101,222,240,0.08)', border: 'rgba(101,222,240,0.4)' },
  newsletter: { fg: '#7ce896', bg: 'rgba(124,232,150,0.08)', border: 'rgba(124,232,150,0.4)' },
  article: { fg: '#f4b965', bg: 'rgba(244,185,101,0.08)', border: 'rgba(244,185,101,0.4)' },
  guide: { fg: '#e76670', bg: 'rgba(231,102,112,0.08)', border: 'rgba(231,102,112,0.4)' },
};

function typeColor(type: string) {
  return TYPE_COLOR[type.toLowerCase()] || TYPE_COLOR.article;
}

/** Estimate reading time. We don't have the body text in the API payload, so
 *  use a deterministic guess from title+subtitle length and the post type
 *  (interviews tend to be longer than newsletters). Better than "5 MIN" everywhere. */
function estReadingTime(item: Item): number {
  const base = (item.title?.length || 0) + (item.subtitle?.length || 0);
  const typeBase: Record<string, number> = {
    interview: 9,
    article: 7,
    newsletter: 4,
    guide: 6,
  };
  const t = typeBase[item.type.toLowerCase()] ?? 5;
  // 1 minute per ~40 chars of subtitle, plus type baseline. Capped 3-14.
  return Math.max(3, Math.min(14, t + Math.floor(base / 60)));
}

/** Format "2025-04-26" as "26 APR 2025" (English) or "26 АПР 2025" (Russian). */
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_RU = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];

function formatBylineDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const months = locale === 'ru' ? MONTHS_RU : MONTHS_EN;
  const monthIdx = parseInt(mo, 10) - 1;
  return `${parseInt(d, 10).toString().padStart(2, '0')} ${months[monthIdx] || mo} ${y}`;
}

interface JournalBroadsheetProps {
  lang?: Locale;
}

export default function JournalBroadsheet({ lang }: JournalBroadsheetProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator('journal') as (
    k: JournalKey,
    vars?: Record<string, string | number>,
  ) => string;

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Honor the about-page deep link /journal#threat-database: land directly
  // on the guides filter instead of the unfiltered feed.
  const [activeTab, setActiveTab] = useState<FilterKey>(() =>
    typeof window !== 'undefined' && window.location.hash === '#threat-database'
      ? 'GUIDE'
      : 'ALL',
  );

  useEffect(() => {
    let cancelled = false;
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
      .then(([posts, guides]) => {
        if (!cancelled) setItems([...posts, ...guides]);
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

  function hrefFor(item: Item): string {
    if (!item.slug) return '#';
    return item.type.toLowerCase() === 'guide'
      ? `/${locale}/guide/${item.slug}`
      : `/${locale}/journal/${item.slug}`;
  }

  const featured = filtered[0];
  const zigzag = filtered.slice(1, 7);
  const compact = filtered.slice(7);

  // Active section number for the eyebrow
  const activeIdx = FILTER_KEYS.indexOf(activeTab);
  const activeEyebrow =
    activeIdx > 0
      ? tr('section_eyebrow')
          .replace('{num}', String(activeIdx + 1).padStart(2, '0'))
          .replace('{label}', tr(activeTab))
      : null;

  return (
    <section className="py-6 sm:py-8">
      {/* ───────────── SECTION INDEX (numbered tab strip) ───────────── */}
      <div className="mt-4">
        {/* Active-section eyebrow (only when a filter is on) */}
        <div
          aria-live="polite"
          className="font-mono text-[10px] uppercase mb-3 min-h-[1em]"
          style={{
            letterSpacing: '0.14em',
            fontWeight: 600,
            color: activeEyebrow ? '#65def0' : 'transparent',
          }}
        >
          {activeEyebrow || ' '}
        </div>

        {/* The index strip — hairline top + bottom, no scroll bars */}
        <div
          role="group"
          aria-label="Journal sections"
          className="border-y border-[#202a44] py-3 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="flex items-center gap-3 sm:gap-5 min-w-max">
            {FILTER_KEYS.map((key, idx) => {
              const isActive = activeTab === key;
              const num = String(idx + 1).padStart(2, '0');
              return (
                <div key={key} className="flex items-center gap-3 sm:gap-5">
                  {idx > 0 && (
                    <span className="font-mono text-[#3a8b9a] select-none" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <button
                    aria-pressed={isActive}
                    onClick={() => setActiveTab(key)}
                    className={`group inline-flex items-baseline gap-1.5 whitespace-nowrap transition-colors duration-200 font-mono text-[11px] sm:text-xs uppercase ${
                      isActive
                        ? 'text-[#65def0]'
                        : 'text-[#aab2c4] hover:text-[#9eecf6]'
                    }`}
                    style={{
                      letterSpacing: '0.14em',
                      fontWeight: 600,
                      borderBottom: isActive ? '2px solid #65def0' : '2px solid transparent',
                      paddingBottom: '4px',
                    }}
                  >
                    <span className="text-[#8b94a8] tabular-nums">{num}.</span>
                    <span>{tr(key)}</span>
                    {isActive && (
                      <span aria-hidden="true" className="ml-0.5 text-[#65def0]">
                        ↓
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ───────────── EMPTY / LOADING ───────────── */}
      {filtered.length === 0 ? (
        <div
          className="py-16 text-center text-[#8b94a8] text-sm"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {isLoading ? tr('loading') : tr('empty')}
        </div>
      ) : (
        <>
          {/* ───────────── FEATURED STORY (60/40, drop-cap on headline) ───────────── */}
          {featured && (
            <FeaturedCard
              item={featured}
              locale={locale}
              tr={tr}
              hrefFor={hrefFor}
              localizedBadge={localizedBadge}
            />
          )}

          {/* ───────────── ZIGZAG (next 6) ───────────── */}
          {zigzag.length > 0 && (
            <div className="mt-12 sm:mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              {zigzag.map((item, idx) => (
                <ZigzagCard
                  key={`zz-${item.type}-${item.id}`}
                  item={item}
                  idx={idx}
                  locale={locale}
                  hrefFor={hrefFor}
                  localizedBadge={localizedBadge}
                />
              ))}
            </div>
          )}

          {/* ───────────── COMPACT LIST (remainder) ───────────── */}
          {compact.length > 0 && (
            <div className="mt-14 sm:mt-20">
              <div className="flex items-baseline justify-between mb-4 sm:mb-5 gap-4">
                <div
                  className="font-mono text-[10px] sm:text-[11px] uppercase text-[#65def0]"
                  style={{ letterSpacing: '0.14em', fontWeight: 600 }}
                >
                  {tr('skim_label')}
                </div>
                <div
                  className="font-mono text-[10px] uppercase text-[#8b94a8] text-right"
                  style={{ letterSpacing: '0.06em' }}
                >
                  {tr('skim_caption')}
                </div>
              </div>
              <ul className="border-t border-[#202a44]">
                {compact.map((item) => (
                  <CompactRow
                    key={`row-${item.type}-${item.id}`}
                    item={item}
                    locale={locale}
                    hrefFor={hrefFor}
                    localizedBadge={localizedBadge}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   FEATURED CARD — 60/40 split, drop-cap on headline first letter, byline.
   ──────────────────────────────────────────────────────────────────────── */

function FeaturedCard({
  item,
  locale,
  tr,
  hrefFor,
  localizedBadge,
}: {
  item: Item;
  locale: Locale;
  tr: (k: JournalKey) => string;
  hrefFor: (i: Item) => string;
  localizedBadge: (t: string) => string;
}) {
  const c = typeColor(item.type);
  const minutes = estReadingTime(item);
  const headlineRaw = item.title || '';

  return (
    <a
      href={hrefFor(item)}
      className="card-interactive group block mt-10 sm:mt-14 border border-[#202a44] bg-[#0b0f1a]"
      style={{ textDecoration: 'none' }}
      aria-label={`${localizedBadge(item.type)}: ${headlineRaw}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Cover — 60% on desktop (3/5 cols) */}
        {item.cover_image && (
          <div className="lg:col-span-3 relative overflow-hidden bg-[#0a0d16] aspect-[4/3] lg:aspect-auto lg:min-h-[360px]">
            <img
              src={item.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'saturate(0.85) contrast(1.05)' }}
              loading="eager"
            />
            {/* Faint dark fade at the bottom for headline contrast on mobile-stack */}
            <div
              className="absolute inset-x-0 bottom-0 h-1/3 lg:hidden pointer-events-none"
              style={{
                background:
                  'linear-gradient(to top, rgba(11,15,26,0.55) 0%, transparent 100%)',
              }}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Text — 40% on desktop (2/5 cols) */}
        <div
          className={`${
            item.cover_image ? 'lg:col-span-2' : 'lg:col-span-5'
          } p-6 sm:p-8 lg:p-10 flex flex-col justify-between`}
        >
          {/* Top: type badge */}
          <div>
            <span
              className="inline-block px-2 py-0.5 text-[10px] uppercase border rounded-sm"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: '0.14em',
                fontWeight: 600,
                color: c.fg,
                backgroundColor: c.bg,
                borderColor: c.border,
              }}
            >
              {localizedBadge(item.type)}
            </span>

            {/* Headline — JetBrains Mono 700, sentence-case */}
            <h2
              className="font-mono font-bold text-[#f3f5fa] mt-5 sm:mt-6 group-hover:text-[#65def0] transition-colors"
              style={{
                fontSize: 'clamp(2rem, 1.2rem + 2.6vw, 3.25rem)',
                letterSpacing: '-0.02em',
                lineHeight: '1.04',
                maxWidth: '22ch',
              }}
            >
              {headlineRaw}
            </h2>

            {/* Lead paragraph — Geist 18px, max-w-60ch */}
            {item.subtitle && (
              <p
                className="text-[#cdd4e3] mt-5 sm:mt-6 leading-[1.55] line-clamp-3 sm:line-clamp-4"
                style={{ fontSize: '1.0625rem', maxWidth: '60ch' }}
              >
                {item.subtitle}
              </p>
            )}
          </div>

          {/* Byline strip */}
          <div
            className="mt-7 sm:mt-9 pt-4 border-t border-[#202a44] font-mono text-[10px] sm:text-[11px] uppercase text-[#8b94a8] flex flex-wrap items-center gap-2"
            style={{ letterSpacing: '0.14em', fontWeight: 600 }}
          >
            <span className="text-[#aab2c4]">{tr('featured_byline')}</span>
            {item.published_at && (
              <>
                <span aria-hidden="true" className="text-[#8b94a8]">
                  ·
                </span>
                <span className="tabular-nums">{formatBylineDate(item.published_at, locale)}</span>
              </>
            )}
            <span aria-hidden="true" className="text-[#8b94a8]">
              ·
            </span>
            <span className="tabular-nums">
              {minutes} {tr('min_read')}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   ZIGZAG CARD — alternating image-left/right at lg+, stacks below.
   First card gets an amber drop-cap.
   ──────────────────────────────────────────────────────────────────────── */

function ZigzagCard({
  item,
  idx,
  locale,
  hrefFor,
  localizedBadge,
}: {
  item: Item;
  idx: number;
  locale: Locale;
  hrefFor: (i: Item) => string;
  localizedBadge: (t: string) => string;
}) {
  const c = typeColor(item.type);
  const imageOnRight = idx % 2 === 1; // image-left on odd cards (0,2,4), image-right on even (1,3,5)
  const headline = item.title || '';
  const firstChar = headline.charAt(0);

  return (
    <a
      href={hrefFor(item)}
      className="card-interactive group block border border-[#202a44] bg-[#121828]"
      style={{ textDecoration: 'none' }}
      aria-label={`${localizedBadge(item.type)}: ${headline}`}
    >
      <div
        className={`grid grid-cols-1 sm:grid-cols-5 ${
          imageOnRight ? 'sm:[direction:rtl]' : ''
        }`}
      >
        {/* Cover */}
        {item.cover_image ? (
          <div
            className="sm:col-span-2 relative overflow-hidden bg-[#0a0d16] aspect-[4/3] sm:aspect-auto sm:min-h-[200px]"
            style={{ direction: 'ltr' }}
          >
            <img
              src={item.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'saturate(0.85) contrast(1.05)' }}
              loading="lazy"
            />
          </div>
        ) : (
          <div
            className="sm:col-span-2 bg-[#0a0d16] flex items-center justify-center min-h-[160px] sm:min-h-[200px]"
            style={{ direction: 'ltr' }}
            aria-hidden="true"
          >
            <span
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                color: c.fg,
                opacity: 0.35,
                letterSpacing: '-0.04em',
              }}
            >
              {firstChar}
            </span>
          </div>
        )}

        {/* Text */}
        <div
          className="sm:col-span-3 p-5 sm:p-6 flex flex-col justify-between gap-4"
          style={{ direction: 'ltr' }}
        >
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="inline-block px-2 py-0.5 text-[10px] uppercase border rounded-sm"
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: '0.14em',
                  fontWeight: 600,
                  color: c.fg,
                  backgroundColor: c.bg,
                  borderColor: c.border,
                }}
              >
                {localizedBadge(item.type)}
              </span>
              {item.published_at && (
                <time
                  className="text-[11px] text-[#8b94a8] tabular-nums"
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: '0.02em',
                  }}
                >
                  {formatBylineDate(item.published_at, locale)}
                </time>
              )}
            </div>

            <h3
              className="font-mono font-bold text-[#e7ecf5] mt-3 group-hover:text-[#65def0] transition-colors"
              style={{
                fontSize: 'clamp(1.125rem, 0.9rem + 0.6vw, 1.4rem)',
                letterSpacing: '-0.015em',
                lineHeight: '1.18',
              }}
            >
              {headline}
            </h3>

            {(item.subtitle || item.description) && (
              <p
                className="text-[#aab2c4] text-sm mt-3 leading-relaxed line-clamp-2"
                style={{ maxWidth: '52ch' }}
              >
                {item.subtitle || item.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   COMPACT ROW — colored badge dot + headline + date + arrow.
   No images; pure density-mode for skimming older entries.
   ──────────────────────────────────────────────────────────────────────── */

function CompactRow({
  item,
  locale,
  hrefFor,
  localizedBadge,
}: {
  item: Item;
  locale: Locale;
  hrefFor: (i: Item) => string;
  localizedBadge: (t: string) => string;
}) {
  const c = typeColor(item.type);
  return (
    <li className="border-b border-[#202a44]">
      <a
        href={hrefFor(item)}
        className="group flex items-center gap-3 sm:gap-5 py-3 sm:py-4 hover:bg-[#121828] transition-colors"
        style={{ textDecoration: 'none' }}
      >
        {/* Color dot + badge label (mono) */}
        <span
          className="hidden sm:inline-flex items-center gap-2 shrink-0"
          style={{ minWidth: '140px' }}
        >
          <span
            className="block w-2 h-2 shrink-0"
            style={{ backgroundColor: c.fg }}
            aria-hidden="true"
          />
          <span
            className="font-mono text-[10px] uppercase"
            style={{
              color: c.fg,
              letterSpacing: '0.14em',
              fontWeight: 600,
            }}
          >
            {localizedBadge(item.type)}
          </span>
        </span>

        {/* Headline — JetBrains Mono. group-hover shifts to cyan. */}
        <span
          className="flex-1 min-w-0 font-mono text-sm sm:text-[15px] text-[#e7ecf5] group-hover:text-[#65def0] transition-colors truncate"
          style={{ letterSpacing: '-0.01em', fontWeight: 500 }}
        >
          {/* On mobile, render a small color square inline so the type is still visible */}
          <span
            className="sm:hidden inline-block w-1.5 h-1.5 mr-2 align-middle"
            style={{ backgroundColor: c.fg }}
            aria-hidden="true"
          />
          {item.title}
        </span>

        {/* Date */}
        {item.published_at && (
          <time
            className="hidden sm:inline text-[11px] text-[#8b94a8] tabular-nums shrink-0"
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.02em',
            }}
          >
            {formatBylineDate(item.published_at, locale)}
          </time>
        )}

        {/* Arrow */}
        <span
          aria-hidden="true"
          className="font-mono text-[#8b94a8] group-hover:text-[#65def0] group-hover:translate-x-0.5 transition-all duration-200 motion-reduce:transform-none shrink-0"
        >
          →
        </span>
      </a>
    </li>
  );
}
