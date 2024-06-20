import { useEffect, useState } from 'react';
import { fetchGuides } from '../utils/api';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

interface Guide {
  id: string;
  title: string;
  slug?: string;
  icon_color?: string;
  threat_level?: number;
  subtitle?: string;
  description?: string;
}

interface ScamTypesGridProps {
  title: string;
  lang?: Locale;
}

// Color mapping by threat level (matches DESIGN.md semantic accents)
function threatColor(level: number | undefined): string {
  if (!level || level <= 2) return '#7ce896'; // green: safe
  if (level === 3) return '#f4b965';            // amber: caution
  if (level === 4) return '#f29b6c';            // mid: warn
  return '#e76670';                              // red: severe
}

// Threat-bar widget — 5 slats, filled per level
function ThreatBar({ level, color, label }: { level: number; color: string; label: string }) {
  return (
    <div
      className="flex gap-1 items-end"
      role="meter"
      aria-valuenow={level}
      aria-valuemin={1}
      aria-valuemax={5}
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((slot) => (
        <span
          key={slot}
          className="block w-[3px]"
          style={{
            height: `${6 + slot * 2}px`,
            background: slot <= level ? color : 'rgba(101, 116, 136, 0.25)',
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function ScamTypesGrid({ title, lang }: ScamTypesGridProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator('scamGrid');
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchGuides(locale)
      .then((data) => {
        const arr: Guide[] = Array.isArray(data) ? data : [];
        if (!cancelled) setGuides(arr.filter((g) => !!g.slug).slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setGuides([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const featured = guides.slice(0, 3);
  const rest = guides.slice(3);

  return (
    <section className="py-6 sm:py-8">
      <h2
        className="text-base sm:text-xl md:text-2xl mb-5 sm:mb-7"
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          color: '#65def0',
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        <span className="text-[#7e879b]">&gt;&nbsp;</span>
        {title}
      </h2>

      {guides.length === 0 && (
        <div className="w-full py-8 text-center text-sm" style={{ color: '#6b7588' }}>
          {isLoading ? tr('loading') : tr('empty')}
        </div>
      )}

      {/* TOP 3 — big cards */}
      {featured.length > 0 && (
        <>
          <div
            className="text-[10px] uppercase tracking-[3px] text-[#7e879b] mb-3"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {tr('most_common')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {featured.map((g) => {
              const level = g.threat_level ?? 3;
              const color = threatColor(level);
              const first = g.title.charAt(0).toUpperCase();
              const description = g.subtitle || g.description || '';
              return (
                <a
                  key={g.id}
                  href={`/${locale}/guide/${g.slug}`}
                  className="card-interactive group block bg-[#121828] border border-[#202a44] p-5"
                  style={{ textDecoration: 'none' }}
                  aria-label={`${g.title} — ${tr('threat')} L${level}`}
                >
                  {/* Header strip */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 flex items-center justify-center"
                      style={{
                        background: 'rgba(244, 185, 101, 0.08)',
                        border: `1px solid ${color}30`,
                      }}
                    >
                      <span
                        className="text-base"
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontWeight: 700,
                          color,
                        }}
                      >
                        {first}
                      </span>
                    </div>
                    <span
                      className="text-[10px] uppercase tracking-[2px] tabular-nums"
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        color,
                      }}
                    >
                      {tr('threat_l')}{level}
                    </span>
                  </div>

                  {/* Title */}
                  <h3
                    className="text-[15px] leading-snug text-[#f3f5fa] mb-2 line-clamp-2"
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {g.title}
                  </h3>

                  {/* Single-line description */}
                  {description && (
                    <p
                      className="text-[12px] leading-snug text-[#aab2c4] line-clamp-2 mb-4"
                      style={{ fontFamily: 'Geist, system-ui, sans-serif' }}
                    >
                      {description}
                    </p>
                  )}

                  {/* Bottom: threat slats + read */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-[#202a44]">
                    <ThreatBar level={level} color={color} label={tr('threat_meter', { level })} />
                    <span
                      className="text-[10px] uppercase tracking-[2px] text-[#aab2c4] group-hover:text-[#65def0] transition-colors"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {tr('read')} <span aria-hidden="true">&#8594;</span>
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}

      {/* REMAINING — compact list */}
      {rest.length > 0 && (
        <>
          <div
            className="text-[10px] uppercase tracking-[3px] text-[#7e879b] mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {tr('full_index')}
          </div>
          <ul className="border border-[#202a44] bg-[#0a0d16]/60 divide-y divide-[#202a44]">
            {rest.map((g) => {
              const level = g.threat_level ?? 2;
              const color = threatColor(level);
              const first = g.title.charAt(0).toUpperCase();
              return (
                <li key={g.id}>
                  <a
                    href={`/${locale}/guide/${g.slug}`}
                    className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[#121828] transition-colors group"
                    style={{ textDecoration: 'none' }}
                    aria-label={`${g.title} — ${tr('threat')} L${level}`}
                  >
                    <span
                      className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-[11px] tabular-nums"
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontWeight: 700,
                        color,
                        background: 'rgba(101, 222, 240, 0.04)',
                        border: `1px solid ${color}30`,
                      }}
                      aria-hidden="true"
                    >
                      {first}
                    </span>
                    <span
                      className="flex-1 text-[13px] text-[#cdd4e3] group-hover:text-[#f3f5fa] transition-colors truncate"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {g.title}
                    </span>
                    <span
                      className="text-[10px] tabular-nums uppercase tracking-[2px] hidden sm:inline"
                      style={{ fontFamily: '"JetBrains Mono", monospace', color }}
                    >
                      {tr('threat_l')}{level}
                    </span>
                    <span
                      className="text-[#7e879b] group-hover:text-[#65def0] transition-colors"
                      aria-hidden="true"
                    >
                      &#8594;
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
