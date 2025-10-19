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
  if (!level || level <= 2) return 'var(--success)'; // green: safe
  if (level === 3) return 'var(--warning)';            // amber: caution
  if (level === 4) return 'var(--threat-mid)';            // mid: warn
  return 'var(--danger)';                              // red: severe
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
            background: slot <= level ? color : 'color-mix(in srgb,var(--muted) 25%,transparent)',
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
          color: 'var(--brand)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        <span className="text-[var(--muted)]">&gt;&nbsp;</span>
        {title}
      </h2>

      {guides.length === 0 && (
        <div className="w-full py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          {isLoading ? tr('loading') : tr('empty')}
        </div>
      )}

      {/* TOP 3 — big cards */}
      {featured.length > 0 && (
        <>
          <div
            className="text-[10px] uppercase tracking-[3px] text-[var(--muted)] mb-3"
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
                  className="card-interactive group block bg-[var(--panel)] border border-[var(--border)] p-5"
                  style={{ textDecoration: 'none' }}
                  aria-label={`${g.title} — ${tr('threat')} L${level}`}
                >
                  {/* Header strip */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 flex items-center justify-center"
                      style={{
                        background: 'color-mix(in srgb,var(--warning) 8%,transparent)',
                        border: `1px solid color-mix(in srgb,${color} 18.82%,transparent)`,
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
                    className="text-[15px] leading-snug text-[var(--text-strong)] mb-2 line-clamp-2"
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
                      className="text-[12px] leading-snug text-[var(--text-soft)] line-clamp-2 mb-4"
                      style={{ fontFamily: 'Geist, system-ui, sans-serif' }}
                    >
                      {description}
                    </p>
                  )}

                  {/* Bottom: threat slats + read */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-[var(--border)]">
                    <ThreatBar level={level} color={color} label={tr('threat_meter', { level })} />
                    <span
                      className="text-[10px] uppercase tracking-[2px] text-[var(--text-soft)] group-hover:text-[var(--brand)] transition-colors"
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
            className="text-[10px] uppercase tracking-[3px] text-[var(--muted)] mb-2"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {tr('full_index')}
          </div>
          <ul className="border border-[var(--border)] bg-[var(--code)]/60 divide-y divide-[var(--border)]">
            {rest.map((g) => {
              const level = g.threat_level ?? 2;
              const color = threatColor(level);
              const first = g.title.charAt(0).toUpperCase();
              return (
                <li key={g.id}>
                  <a
                    href={`/${locale}/guide/${g.slug}`}
                    className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[var(--panel)] transition-colors group"
                    style={{ textDecoration: 'none' }}
                    aria-label={`${g.title} — ${tr('threat')} L${level}`}
                  >
                    <span
                      className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-[11px] tabular-nums"
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontWeight: 700,
                        color,
                        background: 'color-mix(in srgb,var(--brand) 4%,transparent)',
                        border: `1px solid color-mix(in srgb,${color} 18.82%,transparent)`,
                      }}
                      aria-hidden="true"
                    >
                      {first}
                    </span>
                    <span
                      className="flex-1 text-[13px] text-[var(--text-medium)] group-hover:text-[var(--text-strong)] transition-colors truncate"
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
                      className="text-[var(--muted)] group-hover:text-[var(--brand)] transition-colors"
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
