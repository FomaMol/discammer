import { useEffect, useId, useRef, useState } from 'react';
import { analyze, type AnalysisResult, type RedFlag } from '../data/redflags';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

/**
 * MessageChecker — v2 hero checker (T1.1). The "pause, made into a tool",
 * promoted into the home hero.
 *
 * Reuses the SAME pure `analyze()` engine as the full /check MessageAnalyzer —
 * NO fetch, NO logging; the pasted text never leaves the browser. This is a
 * compact teaser: paste a message, first-pass signals stream in live (debounced
 * so it is not per-keystroke thrash), each named tell links to the guide that
 * breaks it down (the detection→learning loop), and a HIGH/CRITICAL result
 * surfaces a "what to do" link. The results region is aria-live so screen-reader
 * users hear the verdict appear. The full analyzer + verdict card live on /check.
 *
 * Threat level always reads as bars + "LVL n/5" + WORD (color is signal #3) —
 * v2 design-system §3/U3.
 */

interface MessageCheckerProps {
  lang?: Locale;
}

// Level → meter color (mirrors the analyzer / ScamTypesGrid semantic palette).
function levelColor(level: number): string {
  if (level <= 0) return 'var(--brand-dim)';
  if (level <= 1) return 'var(--success)';
  if (level === 2) return 'var(--warning)';
  if (level === 3) return 'var(--threat-mid)';
  return 'var(--danger)';
}
function severityColor(severity: 1 | 2 | 3): string {
  if (severity === 3) return 'var(--danger)';
  if (severity === 2) return 'var(--warning)';
  return 'var(--success)';
}

export default function MessageChecker({ lang: langProp }: MessageCheckerProps) {
  const lang = currentLang(langProp);
  const tr = makeTranslator('checker');
  const ta = makeTranslator('analyzer'); // reuse the flag / guide-link strings
  const textareaId = useId();

  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Debounced, in-browser analysis. Pure: nothing is sent or stored.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setResult(null);
      return;
    }
    timer.current = window.setTimeout(() => setResult(analyze(text)), 350);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [text]);

  const level = result?.level ?? 0;
  const color = levelColor(level);
  const lvlWord = (n: number) => tr(`lvl_${Math.max(1, Math.min(5, n))}`);
  const top = (result?.fired ?? []).slice(0, 3);

  return (
    <div className="font-mono">
      {/* terminal-well console */}
      <div
        className="ds-grain rounded-[6px] overflow-hidden border border-[var(--border-strong)] bg-[var(--code)]"
        style={{ boxShadow: '0 0 40px -14px color-mix(in srgb,var(--brand) 18%,transparent)' }}
      >
        {/* header strip */}
        <div className="h-7 flex items-center gap-1.5 px-3 border-b border-[var(--border)] bg-[var(--raised)]">
          <span className="w-2 h-2 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
          <span className="w-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden="true" />
          <span className="w-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden="true" />
          <span className="ml-auto text-[12px] tracking-[0.14em] text-[var(--muted)]">
            {tr('console_label')}
          </span>
        </div>

        <div className="p-3.5">
          <label
            htmlFor={textareaId}
            className="block text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] mb-2"
          >
            {tr('input_label')}
          </label>
          <textarea
            id={textareaId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            placeholder={tr('placeholder')}
            className="w-full min-h-[84px] resize-y bg-[var(--canvas)] border border-[var(--border)] focus:border-[var(--brand-dim)] focus:outline-none rounded-[4px] px-3 py-2.5 text-[16px] leading-[1.55] text-[var(--text)] placeholder:text-[var(--muted)]"
          />

          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {tr('signals_label')}
            </span>
            {result !== null && (
              <span
                className="text-[11px] font-bold tracking-[0.06em] tabular-nums"
                style={{ color }}
                aria-hidden="true"
              >
                LVL {level}/5 · {lvlWord(level)}
              </span>
            )}
          </div>

          {/* live results — announced politely */}
          <div aria-live="polite" className="text-[12px] leading-[1.7] min-h-[52px]">
            {result === null && <span className="text-[var(--muted)]">{tr('awaiting')}</span>}

            {result !== null && (
              <>
                {/* bars + number + word (color is signal #3) */}
                <div className="flex items-center gap-3 mb-2.5">
                  <span
                    className="flex gap-1 items-end"
                    role="meter"
                    aria-valuenow={level}
                    aria-valuemin={0}
                    aria-valuemax={5}
                    aria-label={tr('meter_aria', { level })}
                  >
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span
                        key={s}
                        className="block w-[5px]"
                        style={{
                          height: `${8 + s * 3}px`,
                          background: s <= level ? color : 'color-mix(in srgb,var(--muted) 22%,transparent)',
                        }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                  <span
                    className="text-[11px] font-bold tracking-[0.08em] uppercase tabular-nums"
                    style={{ color }}
                  >
                    LVL {level}/5 · {lvlWord(level)}
                  </span>
                </div>

                {top.length === 0 ? (
                  <p className="text-[14px] leading-[1.55] text-[var(--text-soft)] font-sans">
                    {tr('clean')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {top.map((flag: RedFlag) => {
                      const accent = severityColor(flag.severity);
                      return (
                        <li key={flag.id} className="flex items-start gap-2">
                          <span
                            className="shrink-0 mt-[5px] block w-1.5 h-1.5"
                            style={{ background: accent }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="text-[12px] text-[var(--text)]">
                              {ta(`flags.${flag.flagKey}_label`)}
                            </span>
                            {flag.guideSlug && (
                              <a
                                href={`/${lang}/guide/${flag.guideSlug}`}
                                className="ml-2 text-[12px] uppercase tracking-[0.1em] text-[var(--brand)] hover:text-[var(--brand-hover)] transition-colors whitespace-nowrap"
                              >
                                {ta('guide_link')} <span aria-hidden="true">&#8594;</span>
                              </a>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* privacy line + deeper tool link */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 mt-2">
        <span className="text-[13px] text-[var(--muted)] leading-[1.4]">{tr('privacy')}</span>
        <a
          href={`/${lang}/inspect`}
          className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--brand)] hover:text-[var(--brand-hover)] transition-colors whitespace-nowrap"
        >
          {tr('inspect_link')} <span aria-hidden="true">&#8594;</span>
        </a>
      </div>
    </div>
  );
}
