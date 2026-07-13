import { useEffect, useMemo, useState } from 'react';
import { fetchPosts, fetchGuides } from '../utils/api';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

/**
 * JournalBroadsheet — single React island that owns the entire post grid for
 * the journal page. Renders, in order:
 *
 *   1. Section index (numbered tab strip with active-section eyebrow)
 *   2. Featured story (two selected stories in Interviews, 60/40 split image+text)
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
const FEATURED_INTERVIEW_SLUGS = [
  'interview-with-guest-mike-gibson',
  'interview-with-guest-guy-eames',
];

/** Translator key type for the `client.journal` namespace — kept as a literal
 *  union so the sub-components' `tr` prop stays narrowly typed. */
type JournalKey =
  | FilterKey
  | 'guide_badge'
  | 'section_eyebrow'
  | 'loading'
  | 'empty'
  | 'featured_byline'
  | 'error'
  | 'retry'
  | 'sections_label'
  | 'skim_label'
  | 'skim_caption';

/** Per-type colors. Pulled inline (not class-name interpolation) so Tailwind v4
 *  doesn't see a dynamic class and tree-shake it. */
const TYPE_COLOR: Record<string, { fg: string; bg: string; border: string }> = {
  interview: { fg: 'var(--brand)', bg: 'color-mix(in srgb,var(--brand) 8%,transparent)', border: 'color-mix(in srgb,var(--brand) 40%,transparent)' },
  newsletter: { fg: 'var(--success)', bg: 'color-mix(in srgb,var(--success) 8%,transparent)', border: 'color-mix(in srgb,var(--success) 40%,transparent)' },
  article: { fg: 'var(--warning)', bg: 'color-mix(in srgb,var(--warning) 8%,transparent)', border: 'color-mix(in srgb,var(--warning) 40%,transparent)' },
  guide: { fg: 'var(--danger)', bg: 'color-mix(in srgb,var(--danger) 8%,transparent)', border: 'color-mix(in srgb,var(--danger) 40%,transparent)' },
};

function typeColor(type: string) {
  return TYPE_COLOR[type.toLowerCase()] || TYPE_COLOR.article;
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
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Honor the about-page deep link /journal#threat-database: land directly
  // on the guides filter instead of the unfiltered feed.
  const [activeTab, setActiveTab] = useState<FilterKey>(() =>
    typeof window !== 'undefined' && window.location.hash === '#threat-database'
      ? 'GUIDE'
      : 'ALL',
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(false);
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
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, attempt]);

  useEffect(() => {
    const fallback = document.getElementById("journal-foundation");
    if (fallback) fallback.hidden = !isLoading && !error;
    return () => { if (fallback) fallback.hidden = false; };
  }, [isLoading, error]);

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
    const matches = items.filter((i) => i.type.toLowerCase() === target);
    if (activeTab !== 'INTERVIEW') return matches;
    const priority = (item: Item) => {
      const index = FEATURED_INTERVIEW_SLUGS.indexOf(item.slug);
      return index < 0 ? FEATURED_INTERVIEW_SLUGS.length : index;
    };
    return matches.sort((a, b) => priority(a) - priority(b));
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

  const featuredCount = activeTab === 'INTERVIEW' ? 2 : 1;
  const featured = filtered.slice(0, featuredCount);
  const zigzag = filtered.slice(featuredCount, featuredCount + 6);
  const compact = filtered.slice(featuredCount + 6);

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
            color: activeEyebrow ? 'var(--brand)' : 'transparent',
          }}
        >
          {activeEyebrow || ' '}
        </div>

        {/* The index strip — hairline top + bottom, no scroll bars */}
        <div
          role="group"
          aria-label={tr('sections_label')}
          className="border-y border-[var(--border)] py-3 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="flex items-center gap-3 sm:gap-5 min-w-max">
            {FILTER_KEYS.map((key, idx) => {
              const isActive = activeTab === key;
              const num = String(idx + 1).padStart(2, '0');
              return (
                <div key={key} className="flex items-center gap-3 sm:gap-5">
                  {idx > 0 && (
                    <span className="font-mono text-[var(--brand-dim)] select-none" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <button
                    aria-pressed={isActive}
                    onClick={() => setActiveTab(key)}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const next = event.key === 'Home' ? 0 : event.key === 'End' ? FILTER_KEYS.length - 1 : (idx + (event.key === 'ArrowRight' ? 1 : -1) + FILTER_KEYS.length) % FILTER_KEYS.length;
                      setActiveTab(FILTER_KEYS[next]);
                      event.currentTarget.closest('[role="group"]')?.querySelectorAll('button')[next]?.focus();
                    }}
                    className={`group inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap transition-colors duration-200 font-mono text-[11px] sm:text-xs uppercase ${
                      isActive
                        ? 'text-[var(--brand)]'
                        : 'text-[var(--text-soft)] hover:text-[var(--brand-hover)]'
                    }`}
                    style={{
                      letterSpacing: '0.14em',
                      fontWeight: 600,
                      borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                      paddingBottom: '4px',
                    }}
                  >
                    <span className="text-[var(--muted)] tabular-nums">{num}.</span>
                    <span>{tr(key)}</span>
                    {isActive && (
                      <span aria-hidden="true" className="ml-0.5 text-[var(--brand)]">
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
          role="status"
          className="py-16 text-center text-[var(--muted)] text-sm"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {isLoading ? tr('loading') : error ? tr('error') : tr('empty')}
          {error && <button type="button" className="block mx-auto mt-4 min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>{tr('retry')}</button>}
        </div>
      ) : (
        <>
          {/* ───────────── FEATURED STORY (60/40, drop-cap on headline) ───────────── */}
          {featured.map((item) => (
            <FeaturedCard
              key={`featured-${item.type}-${item.id}`}
              item={item}
              locale={locale}
              tr={tr}
              hrefFor={hrefFor}
              localizedBadge={localizedBadge}
            />
          ))}

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
                  className="font-mono text-[10px] sm:text-[11px] uppercase text-[var(--brand)]"
                  style={{ letterSpacing: '0.14em', fontWeight: 600 }}
                >
                  {tr('skim_label')}
                </div>
                <div
                  className="font-mono text-[10px] uppercase text-[var(--muted)] text-right"
                  style={{ letterSpacing: '0.06em' }}
                >
                  {tr('skim_caption')}
                </div>
              </div>
              <ul className="border-t border-[var(--border)]">
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
  const headlineRaw = item.title || '';

  return (
    <a
      href={hrefFor(item)}
      className="card-interactive group block mt-10 sm:mt-14 border border-[var(--border)] bg-[var(--canvas)]"
      style={{ textDecoration: 'none' }}
      aria-label={`${localizedBadge(item.type)}: ${headlineRaw}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Cover — 60% on desktop (3/5 cols) */}
        {item.cover_image && (
          <div className="lg:col-span-3 relative overflow-hidden bg-[var(--code)] aspect-[4/3] lg:aspect-auto lg:min-h-[360px]">
            <img
              src={item.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'saturate(0.85) contrast(1.05)', objectFit: item.type.toLowerCase() === 'interview' && !item.cover_image?.includes('/static/images/video-posters/') ? 'contain' : 'cover' }}
              loading="eager"
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
            {/* Faint dark fade at the bottom for headline contrast on mobile-stack */}
            <div
              className="absolute inset-x-0 bottom-0 h-1/3 lg:hidden pointer-events-none"
              style={{
                background:
                  'linear-gradient(to top, color-mix(in srgb,var(--canvas) 55%,transparent) 0%, transparent 100%)',
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
              className="font-mono font-bold text-[var(--text-strong)] mt-5 sm:mt-6 group-hover:text-[var(--brand)] transition-colors"
              style={{
                fontSize: 'clamp(2rem, 1.2rem + 2.6vw, 3.25rem)',
                letterSpacing: '-0.02em',
                lineHeight: '1.16',
                maxWidth: '22ch',
              }}
            >
              {headlineRaw}
            </h2>

            {/* Lead paragraph — Geist 18px, max-w-60ch */}
            {item.subtitle && (
              <p
                className="text-[var(--text-medium)] mt-5 sm:mt-6 leading-[1.55] line-clamp-3 sm:line-clamp-4"
                style={{ fontSize: '1.0625rem', maxWidth: '60ch' }}
              >
                {item.subtitle}
              </p>
            )}
          </div>

          {/* Byline strip */}
          <div
            className="mt-7 sm:mt-9 pt-4 border-t border-[var(--border)] font-mono text-[10px] sm:text-[11px] uppercase text-[var(--muted)] flex flex-wrap items-center gap-2"
            style={{ letterSpacing: '0.14em', fontWeight: 600 }}
          >
            <span className="text-[var(--text-soft)]">{tr('featured_byline')}</span>
            {item.published_at && (
              <>
                <span aria-hidden="true" className="text-[var(--muted)]">
                  ·
                </span>
                <span className="tabular-nums">{formatBylineDate(item.published_at, locale)}</span>
              </>
            )}
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
  const wideVideoCover = item.type.toLowerCase() === 'interview' && item.cover_image?.includes('/static/images/video-posters/');

  return (
    <a
      href={hrefFor(item)}
      className="card-interactive group block border border-[var(--border)] bg-[var(--panel)]"
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
            className={`${wideVideoCover ? 'sm:col-span-3' : 'sm:col-span-2'} relative overflow-hidden bg-[var(--code)] aspect-[4/3] sm:aspect-auto sm:min-h-[200px]`}
            style={{ direction: 'ltr' }}
          >
            <img
              src={item.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'saturate(0.85) contrast(1.05)', objectFit: item.type.toLowerCase() === 'interview' && !item.cover_image?.includes('/static/images/video-posters/') ? 'contain' : 'cover' }}
              loading="lazy"
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
          </div>
        ) : (
          <div
          className="sm:col-span-2 bg-[var(--code)] flex items-center justify-center min-h-[160px] sm:min-h-[200px]"
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
          className={`${wideVideoCover ? 'sm:col-span-2' : 'sm:col-span-3'} p-5 sm:p-6 flex flex-col justify-between gap-4`}
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
                  className="text-[11px] text-[var(--muted)] tabular-nums"
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
              className="font-mono font-bold text-[var(--text)] mt-3 group-hover:text-[var(--brand)] transition-colors"
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
                className="text-[var(--text-soft)] text-sm mt-3 leading-relaxed line-clamp-2"
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
    <li className="border-b border-[var(--border)]">
      <a
        href={hrefFor(item)}
        className="group flex items-center gap-3 sm:gap-5 py-3 sm:py-4 hover:bg-[var(--panel)] transition-colors"
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
          className="flex-1 min-w-0 font-mono text-sm sm:text-[15px] text-[var(--text)] group-hover:text-[var(--brand)] transition-colors break-words leading-relaxed"
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
            className="hidden sm:inline text-[11px] text-[var(--muted)] tabular-nums shrink-0"
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
          className="font-mono text-[var(--muted)] group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all duration-200 motion-reduce:transform-none shrink-0"
        >
          →
        </span>
      </a>
    </li>
  );
}
