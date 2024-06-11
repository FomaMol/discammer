import { useId, useRef, useState } from 'react';
import { analyze, type AnalysisResult, type RedFlag } from '../data/redflags';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';
import { useReducedMotion } from '../utils/useReducedMotion';

/**
 * MessageAnalyzer — the flagship "Проверка сообщения" red-flag analyzer (F2).
 *
 * It "installs the pause": paste a suspicious message, press ANALYZE, and read
 * which known scam patterns it trips. The whole analysis runs in `analyze()`
 * from ../data/redflags — a PURE function. There is deliberately NO fetch, NO
 * analytics, NO logging. The text the user pastes never leaves this component,
 * and the UI says so (the privacy line below). Analysis runs only on an
 * explicit ANALYZE click/submit, never on every keystroke.
 *
 * The threat meter reuses ScamTypesGrid's 5-slat pattern and its localized
 * aria-label rule ("threat read: N of 5").
 */

interface MessageAnalyzerProps {
  lang?: Locale;
}

// Meter color by level — mirrors ScamTypesGrid's semantic threat palette.
function levelColor(level: number): string {
  if (level <= 0) return 'rgba(101, 116, 136, 0.5)'; // neutral grey
  if (level <= 1) return '#7ce896'; // green: soft
  if (level === 2) return '#f4b965'; // amber
  if (level === 3) return '#f29b6c'; // mid warn
  return '#e76670'; // red: severe
}

// Per-severity accent for a fired-flag chip.
function severityColor(severity: 1 | 2 | 3): string {
  if (severity === 3) return '#e76670';
  if (severity === 2) return '#f4b965';
  return '#7ce896';
}

/** 5-slat threat meter — same shape + aria-label rule as ScamTypesGrid. */
function ThreatMeter({ level, color, label }: { level: number; color: string; label: string }) {
  return (
    <div
      className="flex gap-1.5 items-end"
      role="meter"
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((slot) => (
        <span
          key={slot}
          className="block w-[6px]"
          style={{
            height: `${10 + slot * 4}px`,
            background: slot <= level ? color : 'rgba(101, 116, 136, 0.22)',
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function MessageAnalyzer({ lang: langProp }: MessageAnalyzerProps) {
  const lang = currentLang(langProp);
  const tr = makeTranslator('analyzer');
  const reduce = useReducedMotion();

  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const textareaId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Pure, in-browser analysis. Nothing is sent anywhere.
    setResult(analyze(text));
  };

  const level = result?.level ?? 0;
  const meterColor = levelColor(level);

  // Localized "signal strength" word for a severity (1..3).
  const sevWord = (severity: 1 | 2 | 3) => tr(`sev_${severity}`);

  return (
    <div className="font-mono">
      <form ref={formRef} onSubmit={onSubmit}>
        <label
          htmlFor={textareaId}
          className="block text-[11px] uppercase tracking-[0.14em] text-[#868fa3] mb-2"
        >
          {tr('input_label')}
        </label>
        <textarea
          id={textareaId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          autoComplete="off"
          placeholder={tr('placeholder')}
          className="w-full resize-y bg-[#0a0d16] border border-[#202a44] focus:border-[#3a8b9a] focus:outline-none rounded-[4px] px-3 py-3 text-[14px] leading-[1.5] text-[#e7ecf5] placeholder:text-[#7e879b]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="shrink-0 px-5 py-2.5 uppercase text-[12px] tracking-[0.14em] font-bold bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition-colors rounded-[4px] cursor-pointer"
          >
            {tr('analyze')}
          </button>
          {/* Privacy line — load-bearing: the text never leaves the browser. */}
          <p className="text-[11px] leading-[1.45] text-[#868fa3] max-w-[46ch]">
            {tr('privacy')}
          </p>
        </div>
      </form>

      {/* Results region — polite so the meter + flags are announced on submit. */}
      <div aria-live="polite" className="mt-8">
        {result === null && (
          <p className="text-[12px] uppercase tracking-[0.14em] text-[#7e879b]">
            {tr('empty_prompt')}
          </p>
        )}

        {result !== null && (
          <>
            {/* Threat meter */}
            <div className="flex items-center gap-4 mb-6">
              <ThreatMeter level={level} color={meterColor} label={tr('meter_label', { level })} />
              <div className="leading-tight">
                <div
                  className="text-[10px] uppercase tracking-[3px] text-[#7e879b]"
                  aria-hidden="true"
                >
                  {tr('meter_caption')}
                </div>
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: meterColor }}
                  aria-hidden="true"
                >
                  {level}<span className="text-[#7e879b] text-base">/5</span>
                </div>
              </div>
            </div>

            {result.fired.length === 0 ? (
              /* Calm, honest "nothing fired" state — no false reassurance. */
              <div className="border border-[#202a44] bg-[#0a0d16]/60 rounded-[4px] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#7ce896] mb-2">
                  {tr('clean_heading')}
                </div>
                <p className="text-[13px] leading-[1.6] text-[#aab2c4] max-w-[64ch] font-sans">
                  {tr('clean_body')}
                </p>
              </div>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-[3px] text-[#7e879b] mb-1">
                  {tr('result_heading')}
                </div>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[#868fa3] tabular-nums mb-4">
                  {result.fired.length === 1
                    ? tr('flag_one', { count: result.fired.length })
                    : tr('flags_count', { count: result.fired.length })}
                </p>

                <ul className="space-y-3">
                  {result.fired.map((flag: RedFlag) => {
                    const accent = severityColor(flag.severity);
                    return (
                      <li
                        key={flag.id}
                        className="border bg-[#121828] rounded-[4px] px-4 py-3.5"
                        style={{ borderColor: `${accent}40`, borderLeftWidth: 3, borderLeftColor: accent }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h3
                            className="text-[14px] font-bold text-[#f3f5fa] leading-snug"
                            style={{ letterSpacing: '-0.01em' }}
                          >
                            {tr(`flags.${flag.flagKey}_label`)}
                          </h3>
                          <span
                            className="shrink-0 text-[9px] uppercase tracking-[2px] mt-0.5 tabular-nums"
                            style={{ color: accent }}
                            aria-label={`${tr('severity_label')}: ${sevWord(flag.severity)}`}
                          >
                            {sevWord(flag.severity)}
                          </span>
                        </div>
                        <p className="text-[13px] leading-[1.55] text-[#aab2c4] font-sans">
                          {tr(`flags.${flag.flagKey}_body`)}
                        </p>
                        {flag.guideSlug && (
                          <a
                            href={`/${lang}/guide/${flag.guideSlug}`}
                            className="inline-flex items-center gap-1 mt-2 text-[11px] uppercase tracking-[0.12em] text-[#65def0] hover:text-[#9eecf6] transition-colors"
                          >
                            {tr('guide_link')} <span aria-hidden="true">&#8594;</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* First 60 seconds — what to do right now. */}
                <div
                  className="mt-7 border border-[#e76670]/40 bg-[#e76670]/[0.06] rounded-[4px] px-4 py-4"
                  style={reduce ? undefined : { transition: 'border-color 200ms' }}
                >
                  <div className="text-[10px] uppercase tracking-[3px] text-[#e76670] mb-3">
                    {tr('first60_heading')}
                  </div>
                  <ol className="space-y-2 list-none">
                    {[tr('first60_1'), tr('first60_2'), tr('first60_3')].map((line, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-[1.55] text-[#cdd4e3] font-sans">
                        <span className="shrink-0 text-[#e76670] tabular-nums font-mono text-[12px] pt-0.5">
                          {i + 1}.
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            {/* Heuristic-not-verdict line — always shown once analyzed. */}
            <p className="mt-6 text-[11px] leading-[1.5] text-[#868fa3] max-w-[64ch] font-sans">
              {tr('disclaimer')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
