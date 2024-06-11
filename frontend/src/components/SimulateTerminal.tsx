import { useEffect, useState } from 'react';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';
import { prefersReducedMotion } from '../utils/useReducedMotion';

interface SimulateTerminalProps {
  lang?: Locale;
}

const SCRIPT_EN = [
  { text: '> ./discammer simulate', color: '#65def0', delay: 400 },
  { text: '[OK]   booting incident simulator...', color: '#7ce896', delay: 700 },
  { text: '[INFO] loading scenario pool ............ 14 ready', color: '#aab2c4', delay: 600 },
  { text: '[INFO] sandbox isolated · network: stub', color: '#aab2c4', delay: 500 },
  { text: '[OK]   sandbox ready', color: '#7ce896', delay: 600 },
  { text: '$', color: '#65def0', delay: 0 },
];

const SCRIPT_RU = [
  { text: '> ./discammer simulate', color: '#65def0', delay: 400 },
  { text: '[OK]   запуск симулятора инцидентов...', color: '#7ce896', delay: 700 },
  { text: '[INFO] загрузка сценариев ............ 14 готово', color: '#aab2c4', delay: 600 },
  { text: '[INFO] песочница изолирована · сеть: заглушка', color: '#aab2c4', delay: 500 },
  { text: '[OK]   песочница готова', color: '#7ce896', delay: 600 },
  { text: '$', color: '#65def0', delay: 0 },
];

export default function SimulateTerminal({ lang }: SimulateTerminalProps) {
  const locale = currentLang(lang);
  const tr = makeTranslator('simulate');
  const script = locale === 'ru' ? SCRIPT_RU : SCRIPT_EN;
  const reduce = prefersReducedMotion();
  const [step, setStep] = useState(reduce ? script.length : 0);

  useEffect(() => {
    if (reduce) return;
    if (step >= script.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), script[step]?.delay ?? 500);
    return () => clearTimeout(t);
  }, [step, script, reduce]);

  return (
    <div className="inline-block text-left w-full max-w-[560px]">
      {/* Terminal block */}
      <div className="bg-[#0a0d16] border border-[#202a44] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#121828] border-b border-[#202a44]">
          <span className="w-2 h-2 rounded-full bg-[#2b3759]"></span>
          <span className="w-2 h-2 rounded-full bg-[#475064]"></span>
          <span className="w-2 h-2 rounded-full bg-[#475064]"></span>
          <span
            className="ml-2 text-[10px] uppercase tracking-[2px] text-[#868fa3]"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {tr('terminal_label')}
          </span>
        </div>

        {/* Output */}
        <pre
          className="px-4 py-3 text-[12px] sm:text-[13px] leading-relaxed whitespace-pre overflow-x-auto"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {script.slice(0, step).map((line, i) => (
            <div key={i} style={{ color: line.color }}>
              {line.text}
              {i === script.length - 1 && (
                <span
                  className="inline-block ml-1.5"
                  style={{
                    color: '#7ce896',
                    animation: reduce ? undefined : 'blink 1s step-end infinite',
                  }}
                  aria-hidden="true"
                >
                  &#9646;
                </span>
              )}
            </div>
          ))}
        </pre>
      </div>

      {/* CTA */}
      <a
        href={`/play/`}
        className="mt-4 inline-flex items-center gap-2 px-6 py-3 font-mono uppercase text-xs sm:text-sm tracking-[2px] bg-[#7ce896]/8 border border-[#7ce896] text-[#7ce896] hover:bg-[#7ce896]/15 hover:shadow-[0_0_28px_rgba(124,232,150,0.28)] transition-all duration-300"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
      >
        <span aria-hidden="true">&#9654;</span>
        <span>{tr('label')}</span>
      </a>
    </div>
  );
}
