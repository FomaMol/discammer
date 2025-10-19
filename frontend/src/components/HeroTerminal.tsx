import { useEffect, useState, useRef } from 'react';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';
import { prefersReducedMotion } from '../utils/useReducedMotion';

interface HeroTerminalProps {
  lines?: string[];
  lang?: Locale;
}

// Fallback only — the home page passes real, server-derived `lines` (see
// home.html). These defaults carry NO fabricated metrics: inventing live
// telemetry (kit counts, ROC AUC, a 247-entry DB when the real count is ~20)
// violates PRODUCT.md "show the work, not the costume" and the P2-1 stat-truth
// rule. Boot/flavor lines are fine; numbers must be real, so they come from props.
const LINES_EN: string[] = [
  '> init scanner --module=threat_db',
  '> loading signatures ......... [OK]',
  '> tracking: phishing / deepfake_voice / pig_butchering / fake_store',
  '> oracle: "trust nothing on first contact"',
  '> AWAITING USER COMMAND _',
];

const LINES_RU: string[] = [
  '> init scanner --module=threat_db',
  '> загрузка сигнатур ......... [OK]',
  '> отслеживание: phishing / deepfake_voice / pig_butchering / fake_store',
  '> оракул: «не доверяй с первого контакта»',
  '> ОЖИДАНИЕ КОМАНДЫ ПОЛЬЗОВАТЕЛЯ _',
];

const STATUS_TOKENS = {
  en: { ok: '[OK]', established: 'ESTABLISHED', awaiting: 'AWAITING' },
  ru: { ok: '[OK]', established: 'УСТАНОВЛЕНО', awaiting: 'ОЖИДАНИЕ' },
} as const;

export default function HeroTerminal({ lines, lang }: HeroTerminalProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator('heroTerminal');
  const defaultLines = locale === 'ru' ? LINES_RU : LINES_EN;
  const source = lines && lines.length > 0 ? lines : defaultLines;
  const tokens = STATUS_TOKENS[locale];
  const reduce = prefersReducedMotion();
  const [visible, setVisible] = useState<number>(reduce ? source.length : 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return;
    if (visible >= source.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 180);
    return () => clearTimeout(t);
  }, [visible, source.length, reduce]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible]);

  function lineColor(line: string): string {
    if (line.includes(tokens.ok) || line.includes(tokens.established) || line.includes('200')) return 'var(--success)';
    if (line.includes(tokens.awaiting)) return 'var(--warning)';
    if (line.startsWith('   ')) return 'var(--text-soft)';
    return 'var(--brand)';
  }

  return (
    <div>
      {/* MONITOR 02 label — frames the terminal as a second screen */}
      <div
        className="flex items-center justify-between mb-2 px-1"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
      >
        <span className="text-[10px] uppercase tracking-[2.5px] text-[var(--muted)]">
          {tr('monitor_label')}
        </span>
        <span className="text-[10px] uppercase tracking-[2px] text-[var(--muted)] tabular-nums">
          {tr('monitor_subtitle')}
        </span>
      </div>
    <div className="bg-[var(--canvas)]/90 border border-[var(--border)] overflow-hidden shadow-[0_0_40px_color-mix(in_srgb,var(--brand)_8%,transparent)] backdrop-blur-sm">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--panel)] border-b border-[var(--border)]">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-strong)]"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--muted)]"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--muted)]"></span>
        <span
          className="ml-3 text-[10px] uppercase tracking-[2px] text-[var(--text-soft)]"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          discammer@threat-monitor ~ %
        </span>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="px-4 py-4 h-[280px] sm:h-[320px] lg:h-[360px] overflow-y-auto text-xs sm:text-sm leading-relaxed scrollbar-hide"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
      >
        {source.slice(0, visible).map((line, i) => (
          <div
            key={i}
            style={{
              color: lineColor(line),
              whiteSpace: 'pre',
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {line}
          </div>
        ))}
        {!reduce && visible < source.length && (
          <span
            className="inline-block"
            style={{
              color: 'var(--brand)',
              animation: 'blink 1s step-end infinite',
              fontFamily: '"JetBrains Mono", monospace',
            }}
            aria-hidden="true"
          >
            &#x25AE;
          </span>
        )}
      </div>
    </div>
    </div>
  );
}
