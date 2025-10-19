import { useEffect, useMemo, useRef, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import { prefersReducedMotion } from '../utils/useReducedMotion';

interface Props {
  locale?: Locale;
  /** Long-form course title (already localised). */
  courseTitle: string;
  /** Pre-summed totals from the server. */
  moduleCount: number;
  lessonCount: number;
  runtime: string;
  /** Slug of the first module — for the START MISSION button href. */
  firstModuleSlug?: string;
}

/**
 * Mission Briefing Terminal — the full-width tactical hero used on /course.
 *
 * On first session, the body types itself line-by-line. On subsequent loads it
 * renders fully. Respects prefers-reduced-motion. The "type once per session"
 * is gated by sessionStorage; this guarantees the typewriter is the page-load
 * signature animation rather than a recurring distraction.
 */

const SESSION_KEY = 'discammer:course:briefing-typed:v1';

type Tone = 'cyan' | 'amber' | 'ink' | 'green' | 'mute';

interface Line {
  /** Visible text. Will be uppercased for display. */
  text: string;
  tone: Tone;
  /** Optional leading caret — `>` for terminal, `▸` for sub-bullets. */
  caret?: '>' | '▸' | '';
  /** Whether this is the "blank spacer" line. */
  spacer?: boolean;
}

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'cyan':
      return 'text-[var(--brand)]';
    case 'amber':
      return 'text-[var(--warning)]';
    case 'green':
      return 'text-[var(--success)]';
    case 'mute':
      return 'text-[var(--muted)]';
    default:
      return 'text-[var(--text-medium)]';
  }
}

function caretClass(caret: string): string {
  if (caret === '▸') return 'text-[var(--warning)]';
  return 'text-[var(--brand)]';
}

export default function MissionBriefingTerminal({
  locale,
  courseTitle,
  moduleCount,
  lessonCount,
  runtime,
  firstModuleSlug,
}: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('briefing');
  const shellLabel = tr('shell_label');

  const accessLine = tr('access');
  const transmissionLine = tr('transmission');
  const countsLine = tr('counts', {
    modules: moduleCount,
    lessons: lessonCount,
    runtime: runtime.toUpperCase(),
  });
  const certLine = tr('cert');
  const statusLine = tr('status_ready');

  const ctaStart = tr('cta_start');
  const ctaModules = tr('cta_modules');
  const ctaBrief = tr('cta_brief');

  const lines: Line[] = useMemo(
    () => [
      { text: accessLine, tone: 'cyan', caret: '>' },
      { text: transmissionLine, tone: 'mute', caret: '>' },
      { text: '', tone: 'mute', caret: '>', spacer: true },
      { text: courseTitle.toUpperCase(), tone: 'cyan', caret: '>' },
      { text: '', tone: 'mute', caret: '>', spacer: true },
      { text: countsLine, tone: 'ink', caret: '▸' },
      { text: certLine, tone: 'ink', caret: '▸' },
      { text: statusLine, tone: 'green', caret: '▸' },
    ],
    [accessLine, transmissionLine, courseTitle, countsLine, certLine, statusLine],
  );

  const reduce = prefersReducedMotion();
  const alreadyTyped = (() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return true;
    }
  })();

  // visibleLines = how many lines have fully appeared.
  const [visibleLines, setVisibleLines] = useState<number>(
    reduce || alreadyTyped ? lines.length : 0,
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || alreadyTyped) return;
    if (visibleLines >= lines.length) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* noop */
      }
      return;
    }
    // First two lines slow (intro feeling), then spacer lines instant, then
    // body lines at a brisk pace. Total reveal feels like a transmission.
    const cur = lines[visibleLines];
    const delay = cur.spacer ? 120 : visibleLines === 0 ? 380 : visibleLines === 3 ? 520 : 200;
    timerRef.current = window.setTimeout(
      () => setVisibleLines((v) => v + 1),
      delay,
    );
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [visibleLines, lines, reduce, alreadyTyped]);

  const allShown = visibleLines >= lines.length;

  return (
    <section
      aria-label="Mission briefing"
      className="relative bg-[var(--panel)] border border-[var(--border)] rounded-[4px] overflow-hidden"
    >
      {/* Header bar: 3 hairline dots + label */}
      <header className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--raised)]/60">
        <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)]" aria-hidden="true" />
        <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)]" aria-hidden="true" />
        <span className="block w-2 h-2 rounded-full border border-[var(--border-strong)]" aria-hidden="true" />
        <span className="ml-2 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)] truncate">
          {shellLabel}
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--success)]">
          <span className="status-dot" aria-hidden="true" />
          <span aria-hidden="true">LIVE</span>
        </span>
      </header>

      {/* Body */}
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        <div
          className="font-mono text-[12px] sm:text-[13px] leading-[1.7] sm:leading-[1.85]"
          role="log"
          aria-live="polite"
        >
          {lines.slice(0, visibleLines).map((ln, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${ln.spacer ? 'h-[0.85em]' : ''}`}
            >
              {!ln.spacer && (
                <>
                  <span
                    className={`shrink-0 ${caretClass(ln.caret || '>')} font-bold select-none`}
                    aria-hidden="true"
                  >
                    {ln.caret || '>'}
                  </span>
                  <span
                    className={`flex-1 break-words ${toneClass(ln.tone)} ${
                      i === 3 ? 'font-bold tracking-[-0.01em] text-[14px] sm:text-[16px]' : ''
                    }`}
                  >
                    {ln.text}
                  </span>
                </>
              )}
            </div>
          ))}
          {!allShown && (
            <span
              className="inline-block ml-1 text-[var(--brand)] font-mono"
              style={{ animation: reduce ? undefined : 'blink 1s step-end infinite' }}
              aria-hidden="true"
            >
              &#x25AE;
            </span>
          )}
          {allShown && (
            <div className="mt-1 inline-flex items-center gap-2">
              <span className="text-[var(--brand)]" aria-hidden="true">{'>'}</span>
              <span
                className="inline-block text-[var(--brand)] font-mono"
                style={{ animation: reduce ? undefined : 'blink 1s step-end infinite' }}
                aria-hidden="true"
              >
                &#x25AE;
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CTA strip */}
      <div className="px-4 sm:px-6 pb-6 sm:pb-7 pt-1 border-t border-[var(--border)] bg-[var(--canvas)]/40">
        <div className="flex flex-wrap items-center gap-3 pt-5">
          <a
            href={firstModuleSlug ? `/${lang}/course/${firstModuleSlug}` : `/${lang}/course#modules`}
            className="dcm-briefing-cta-primary inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition-transform rounded-[4px] font-bold focus-visible:outline-none focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:3px]"
          >
            <span aria-hidden="true">▸</span> {ctaStart}
          </a>
          <a
            href="#modules"
            className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] border border-[var(--border-strong)] text-[var(--text)] hover:border-[var(--brand-dim)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand)] transition rounded-[4px]"
          >
            <span aria-hidden="true">▸</span> {ctaModules}
          </a>
          <a
            href="mailto:academy@discammer.com?subject=DiScammer%20Course%20Brief"
            className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] border border-[var(--border-strong)] text-[var(--text-soft)] hover:border-[var(--brand-dim)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand)] transition rounded-[4px]"
          >
            <span aria-hidden="true">▸</span> {ctaBrief}
          </a>
        </div>
      </div>

      {/* `.dcm-briefing-cta-primary` hover/active transforms +
          reduced-motion suppression live in globals.css. */}
    </section>
  );
}
