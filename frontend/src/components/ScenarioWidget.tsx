import { useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';

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

const BUNDLES = {
  en: {
    heading: '// FIELD SIMULATION',
    prompt_default: 'What do you do?',
    reset: 'Re-run simulation',
    moral: '// FIELD NOTE',
    outcome_optimal: 'OPTIMAL',
    outcome_compromised: 'COMPROMISED',
    outcome_mission_failed: 'MISSION FAILED',
  },
  ru: {
    heading: '// ПОЛЕВАЯ СИМУЛЯЦИЯ',
    prompt_default: 'Что ты делаешь?',
    reset: 'Перезапустить симуляцию',
    moral: '// ЗАМЕТКА С ПОЛЯ',
    outcome_optimal: 'ОПТИМАЛЬНО',
    outcome_compromised: 'СКОМПРОМЕТИРОВАНО',
    outcome_mission_failed: 'МИССИЯ ПРОВАЛЕНА',
  },
} as const;

type OutcomeKey = 'outcome_optimal' | 'outcome_compromised' | 'outcome_mission_failed';

const OUTCOME_STYLES: Record<
  Outcome,
  { border: string; bg: string; text: string; symbol: string; labelKey: OutcomeKey }
> = {
  good: {
    border: 'border-[#7ce896]',
    bg: 'bg-[#7ce896]/10',
    text: 'text-[#7ce896]',
    symbol: '▶',
    labelKey: 'outcome_optimal',
  },
  risky: {
    border: 'border-[#f4b965]',
    bg: 'bg-[#f4b965]/10',
    text: 'text-[#f4b965]',
    symbol: '▲',
    labelKey: 'outcome_compromised',
  },
  disaster: {
    border: 'border-[#e76670]',
    bg: 'bg-[#e76670]/10',
    text: 'text-[#e76670]',
    symbol: '✗',
    labelKey: 'outcome_mission_failed',
  },
};

export default function ScenarioWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator(lang, BUNDLES);
  const [picked, setPicked] = useState<number | null>(null);

  const headingLabel = tr('heading');
  const promptDefault = tr('prompt_default');
  const resetLabel = tr('reset');
  const moralLabel = tr('moral');

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
              text: `${style.symbol} ${choice.label || tr(style.labelKey)}`,
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
