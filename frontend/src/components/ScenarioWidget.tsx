import { useState } from 'react';
import { Locale, normalizeLocale, pick } from '../utils/i18n';

type Outcome = 'good' | 'risky' | 'disaster';

export interface ScenarioChoice {
  text: string;
  outcome: Outcome;
  label?: string;
  explanation?: string;
}

export interface ScenarioConfig {
  /** Optional setting line: "You are at your desk. An email arrives..." */
  setup?: string;
  /** The question prompted to the learner: "What do you do?" */
  prompt: string;
  /** Available responses. Mark each with the resulting outcome class. */
  choices: ScenarioChoice[];
  /** Lesson moral surfaced after any answer is picked. */
  moral?: string;
}

interface Props {
  config: ScenarioConfig;
  locale: Locale;
}

const OUTCOME_STYLES: Record<
  Outcome,
  { border: string; bg: string; text: string; symbol: string; label: { en: string; ru: string } }
> = {
  good: {
    border: 'border-[#7ce896]',
    bg: 'bg-[#7ce896]/10',
    text: 'text-[#7ce896]',
    symbol: '✓',
    label: { en: 'GOOD CALL', ru: 'ХОРОШИЙ ХОД' },
  },
  risky: {
    border: 'border-[#f4b965]',
    bg: 'bg-[#f4b965]/10',
    text: 'text-[#f4b965]',
    symbol: '!',
    label: { en: 'RISKY', ru: 'РИСКОВАННО' },
  },
  disaster: {
    border: 'border-[#e76670]',
    bg: 'bg-[#e76670]/10',
    text: 'text-[#e76670]',
    symbol: '✗',
    label: { en: 'DISASTER', ru: 'КАТАСТРОФА' },
  },
};

export default function ScenarioWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const [picked, setPicked] = useState<number | null>(null);

  const headingLabel = pick(lang, {
    en: '// SCENARIO',
    ru: '// СЦЕНАРИЙ',
  });
  const promptDefault = pick(lang, {
    en: 'What do you do?',
    ru: 'Что ты делаешь?',
  });
  const resetLabel = pick(lang, {
    en: 'Try a different choice',
    ru: 'Выбрать другой вариант',
  });
  const moralLabel = pick(lang, {
    en: '// LESSON',
    ru: '// ВЫВОД',
  });

  return (
    <section className="relative bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#65def0] mb-3">
        {headingLabel}
      </div>

      {config.setup && (
        <p className="font-sans text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
          {config.setup}
        </p>
      )}

      <p className="mt-4 font-sans text-[#e7ecf5] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]">
        {config.prompt || promptDefault}
      </p>

      <div className="mt-5 space-y-2.5">
        {config.choices.map((choice, i) => {
          const isPicked = picked === i;
          const style = OUTCOME_STYLES[choice.outcome];
          let stateClass: string;
          let badge: { text: string; cls: string } | null = null;

          if (isPicked) {
            stateClass = `${style.border} ${style.bg}`;
            badge = {
              text: `${style.symbol} ${choice.label || pick(lang, style.label)}`,
              cls: style.text,
            };
          } else if (picked === null) {
            stateClass = 'border-[#202a44] hover:border-[#65def0] hover:bg-[#65def0]/5';
          } else {
            stateClass = 'border-[#202a44] opacity-50';
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              disabled={picked !== null && picked !== i}
              aria-pressed={isPicked}
              className={`w-full text-left p-4 border transition rounded-[3px] ${stateClass} ${
                picked !== null && picked !== i ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 font-sans text-[15px] text-[#e7ecf5] leading-relaxed">
                  {choice.text}
                </p>
                {badge && (
                  <span
                    className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${badge.cls} pt-0.5`}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              {isPicked && choice.explanation && (
                <p className="mt-3 font-sans text-[14px] text-[#cdd4e3] leading-relaxed">
                  {choice.explanation}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {picked !== null && config.moral && (
        <div className="mt-5 p-4 border border-[#65def0]/40 bg-[#65def0]/5 rounded-[3px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#65def0] mb-2">
            {moralLabel}
          </div>
          <p className="font-sans text-[14px] text-[#cdd4e3] leading-relaxed">{config.moral}</p>
        </div>
      )}

      {picked !== null && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0] transition"
          >
            ↺ {resetLabel}
          </button>
        </div>
      )}
    </section>
  );
}
