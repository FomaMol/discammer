import { useId, useRef, useState } from 'react';
import { inspect, type InspectionResult, type UrlFinding } from '../data/url_heuristics';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';
import { useReducedMotion } from '../utils/useReducedMotion';

/**
 * LinkInspector — the link/URL inspector island (F2), flagship sibling of the
 * MessageAnalyzer.
 *
 * Paste a URL, press INSPECT, and read which known link tells it trips — each
 * named, explained plainly, and (where relevant) linked to the phishing guide.
 * The whole inspection runs in `inspect()` from ../data/url_heuristics — a PURE
 * function. There is deliberately NO fetch, NO analytics, NO logging, and the
 * page behind the link is NEVER opened. The URL the user pastes never leaves
 * this component, and the UI says so (the "stays in your browser" line below).
 * Inspection runs only on an explicit INSPECT click/submit, never on every
 * keystroke.
 *
 * The risk meter reuses the same 5-slat pattern and localized aria-label rule as
 * ScamTypesGrid / MessageAnalyzer ("link risk read: N of 5").
 */

interface LinkInspectorProps {
  lang?: Locale;
}

// Meter color by level — mirrors the analyzer's semantic threat palette.
function levelColor(level: number): string {
  if (level <= 0) return 'rgba(101, 116, 136, 0.5)'; // neutral grey
  if (level <= 1) return '#7ce896'; // green: soft
  if (level === 2) return '#f4b965'; // amber
  if (level === 3) return '#f29b6c'; // mid warn
  return '#e76670'; // red: severe
}

// Per-severity accent for a fired-finding chip.
function severityColor(severity: 1 | 2 | 3): string {
  if (severity === 3) return '#e76670';
  if (severity === 2) return '#f4b965';
  return '#7ce896';
}

/** 5-slat risk meter — same shape + aria-label rule as ScamTypesGrid. */
function RiskMeter({ level, color, label }: { level: number; color: string; label: string }) {
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

export default function LinkInspector({ lang: langProp }: LinkInspectorProps) {
  const lang = currentLang(langProp);
  const tr = makeTranslator('inspect');
  const reduce = useReducedMotion();

  const [url, setUrl] = useState('');
  const [result, setResult] = useState<InspectionResult | null>(null);
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Pure, in-browser inspection. The URL is never sent anywhere or opened.
    setResult(inspect(url));
  };

  const level = result?.level ?? 0;
  const meterColor = levelColor(level);

  // Localized "signal strength" word for a severity (1..3).
  const sevWord = (severity: 1 | 2 | 3) => tr(`sev_${severity}`);

  return (
    <div className="font-mono">
      <form ref={formRef} onSubmit={onSubmit}>
        <label
          htmlFor={inputId}
          className="block text-[11px] uppercase tracking-[0.14em] text-[#8b94a8] mb-2"
        >
          {tr('input_label')}
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={tr('placeholder')}
          className="w-full bg-[#0a0d16] border border-[#202a44] focus:border-[#3a8b9a] focus:outline-none rounded-[4px] px-3 py-3 text-[14px] leading-[1.5] text-[#e7ecf5] placeholder:text-[#8b94a8]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="shrink-0 px-5 py-2.5 uppercase text-[12px] tracking-[0.14em] font-bold bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition-colors rounded-[4px] cursor-pointer"
          >
            {tr('inspect')}
          </button>
          {/* Privacy line — load-bearing: the link stays in the browser. */}
          <p className="text-[11px] leading-[1.45] text-[#8b94a8] max-w-[46ch]">
            {tr('privacy')}
          </p>
        </div>
      </form>

      {/* Results region — polite so the meter + findings are announced on submit. */}
      <div aria-live="polite" className="mt-8">
        {result === null && (
          <p className="text-[12px] uppercase tracking-[0.14em] text-[#8b94a8]">
            {tr('empty_prompt')}
          </p>
        )}

        {result !== null && (
          <>
            {/* Risk meter */}
            <div className="flex items-center gap-4 mb-6">
              <RiskMeter level={level} color={meterColor} label={tr('meter_label', { level })} />
              <div className="leading-tight">
                <div
                  className="text-[10px] uppercase tracking-[3px] text-[#8b94a8]"
                  aria-hidden="true"
                >
                  {tr('meter_caption')}
                </div>
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: meterColor }}
                  aria-hidden="true"
                >
                  {level}
                  <span className="text-[#8b94a8] text-base">/5</span>
                </div>
              </div>
            </div>

            {/* Echo the host we judged, when one could be read. */}
            {result.parsed.host && (
              <p className="text-[11px] leading-[1.45] text-[#8b94a8] mb-5 break-all">
                {tr('judged_host', { host: result.parsed.host })}
              </p>
            )}

            {result.findings.length === 0 ? (
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
                <div className="text-[10px] uppercase tracking-[3px] text-[#8b94a8] mb-1">
                  {tr('result_heading')}
                </div>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[#8b94a8] tabular-nums mb-4">
                  {result.findings.length === 1
                    ? tr('finding_one', { count: result.findings.length })
                    : tr('findings_count', { count: result.findings.length })}
                </p>

                <ul className="space-y-3">
                  {result.findings.map((finding: UrlFinding) => {
                    const accent = severityColor(finding.severity);
                    return (
                      <li
                        key={finding.id}
                        className="border bg-[#121828] rounded-[4px] px-4 py-3.5"
                        style={{
                          borderColor: `${accent}40`,
                          borderLeftWidth: 3,
                          borderLeftColor: accent,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h3
                            className="text-[14px] font-bold text-[#f3f5fa] leading-snug"
                            style={{ letterSpacing: '-0.01em' }}
                          >
                            {tr(`explain.${finding.explainKey}_label`)}
                          </h3>
                          <span
                            className="shrink-0 text-[9px] uppercase tracking-[2px] mt-0.5 tabular-nums"
                            style={{ color: accent }}
                            aria-label={`${tr('severity_label')}: ${sevWord(finding.severity)}`}
                          >
                            {sevWord(finding.severity)}
                          </span>
                        </div>
                        <p className="text-[13px] leading-[1.55] text-[#aab2c4] font-sans">
                          {tr(`explain.${finding.explainKey}_body`)}
                        </p>
                        {finding.guideSlug && (
                          <a
                            href={`/${lang}/guide/${finding.guideSlug}`}
                            className="inline-flex items-center gap-1 mt-2 text-[11px] uppercase tracking-[0.12em] text-[#65def0] hover:text-[#9eecf6] transition-colors"
                          >
                            {tr('guide_link')} <span aria-hidden="true">&#8594;</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* Heuristic-not-verdict line — always shown once inspected. */}
            <p
              className="mt-6 text-[11px] leading-[1.5] text-[#8b94a8] max-w-[64ch] font-sans"
              style={reduce ? undefined : { transition: 'color 200ms' }}
            >
              {tr('disclaimer')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
