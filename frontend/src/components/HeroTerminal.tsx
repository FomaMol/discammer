import { useEffect, useState, useRef } from 'react';
import { currentLang, pick, type Locale } from '../utils/i18n';

interface HeroTerminalProps {
  lines?: string[];
  lang?: Locale;
}

const LINES_EN: string[] = [
  '> init scanner --module=threat_db',
  '> loading signatures ............ [OK]',
  '> connecting feed.discammer.com',
  '> handshake ESTABLISHED',
  '> auth: anon-guest                  [200]',
  '> scanning vector: phishing/2024',
  '   ├─ kits matched: 218',
  '   └─ avg lifespan: 38h',
  '> scanning vector: deepfake/audio',
  '   ├─ samples: 1,407',
  '   └─ ROC AUC: 0.93',
  '> scanning vector: investment-fraud',
  '   ├─ pump-and-dump: 64 active',
  '   └─ pig-butchering: 142 tracked',
  '> threat_db.size = 247 entries',
  '> last_breach   = 02:14:09 UTC',
  '> oracle: "trust nothing on first contact"',
  '> > > AWAITING USER COMMAND _',
];

const LINES_RU: string[] = [
  '> init scanner --module=threat_db',
  '> загрузка сигнатур ............ [OK]',
  '> подключение к feed.discammer.com',
  '> рукопожатие УСТАНОВЛЕНО',
  '> auth: anon-guest                  [200]',
  '> сканирование вектора: phishing/2024',
  '   ├─ найдено наборов: 218',
  '   └─ средний срок жизни: 38ч',
  '> сканирование вектора: deepfake/audio',
  '   ├─ образцов: 1 407',
  '   └─ ROC AUC: 0.93',
  '> сканирование вектора: investment-fraud',
  '   ├─ pump-and-dump: 64 активных',
  '   └─ «забой свиньи»: 142 отслежено',
  '> threat_db.size = 247 записей',
  '> last_breach   = 02:14:09 UTC',
  '> оракул: «не доверяй с первого контакта»',
  '> > > ОЖИДАНИЕ КОМАНДЫ ПОЛЬЗОВАТЕЛЯ _',
];

const STATUS_TOKENS = {
  en: { ok: '[OK]', established: 'ESTABLISHED', awaiting: 'AWAITING' },
  ru: { ok: '[OK]', established: 'УСТАНОВЛЕНО', awaiting: 'ОЖИДАНИЕ' },
} as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export default function HeroTerminal({ lines, lang }: HeroTerminalProps) {
  const locale = currentLang(lang);
  const defaultLines = pick(locale, { en: LINES_EN, ru: LINES_RU });
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
    if (line.includes(tokens.ok) || line.includes(tokens.established) || line.includes('200')) return '#7ce896';
    if (line.includes(tokens.awaiting)) return '#f4b965';
    if (line.startsWith('   ')) return '#aab2c4';
    return '#65def0';
  }

  return (
    <div className="bg-[#0b0f1a]/90 border border-[#202a44] rounded-md overflow-hidden shadow-[0_0_40px_rgba(101,222,240,0.08)] backdrop-blur-sm">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#121828] border-b border-[#202a44]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#e76670]"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-[#f4b965]"></span>
        <span className="w-2.5 h-2.5 rounded-full bg-[#7ce896]"></span>
        <span
          className="ml-3 text-[10px] uppercase tracking-[2px] text-[#aab2c4]"
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
              color: '#65def0',
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
  );
}
