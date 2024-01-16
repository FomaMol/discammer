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

const OUTCOME_STYLES: Record<Outcome, { ring: string; text: string; bar: string; label: { en: string; ru: string } }> = {
  good: {
    ring: 'border-[#39FF6B] bg-[#39FF6B]/5',
    text: 'text-[#39FF6B]',
    bar: 'bg-[#39FF6B]',
    label: { en: 'GOOD CALL', ru: 'ХОРОШИЙ ХОД' },
  },
  risky: {
    ring: 'border-[#FFB547] bg-[#FFB547]/5',
    text: 'text-[#FFB547]',
    bar: 'bg-[#FFB547]',
    label: { en: 'RISKY', ru: 'РИСКОВАННО' },
  },
  disaster: {
    ring: 'border-[#FF4757] bg-[#FF4757]/5',
    text: 'text-[#FF4757]',
    bar: 'bg-[#FF4757]',
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
  const promptLabel = pick(lang, {
    en: 'What do you do?',
    ru: 'Что ты делаешь?',
  });
  const resetLabel = pick(lang, {
    en: 'Try a different choice',
    ru: 'Выбрать другой вариант',
  });
  const moralLabel = pick(lang, {
    en: 'The lesson',
    ru: 'Вывод',
  });

  return (
    <div className="relative bg-[#131829] border border-[#1E2A42] p-5 sm:p-6">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-3">
        {headingLabel}
      </div>

      {config.setup && (
        <p className="text-sm text-[#C8D0E0] leading-relaxed">{config.setup}</p>
      )}

      <p className="mt-4 text-[#E4E8F1] text-base sm:text-lg font-semibold">
        {config.prompt || promptLabel}
      </p>

      <div className="mt-5 space-y-3">
        {config.choices.map((choice, i) => {
          const isPicked = picked === i;
          const style = OUTCOME_STYLES[choice.outcome];
          // After a pick, only the chosen option is highlighted; others stay calm.
          const visualClass = isPicked
            ? `${style.ring}`
            : picked === null
            ? 'border-[#1E2A42] hover:border-[#00F0FF]/40'
            : 'border-[#1E2A42] opacity-50';

          return (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              disabled={picked !== null && picked !== i}
              aria-pressed={isPicked}
              className={`w-full text-left p-4 border transition ${visualClass} ${
                picked !== null && picked !== i ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 inline-block w-1.5 h-6 ${isPicked ? style.bar : 'bg-[#1E2A42]'} shrink-0`}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-sm text-[#E4E8F1] leading-relaxed">{choice.text}</p>
                  {isPicked && (
                    <div className="mt-3">
                      <span
                        className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${style.text}`}
                      >
                        {choice.label || pick(lang, style.label)}
                      </span>
                      {choice.explanation && (
                        <p className="mt-2 text-sm text-[#C8D0E0] leading-relaxed">
                          {choice.explanation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {picked !== null && config.moral && (
        <div className="mt-5 p-4 border-l-2 border-[#00F0FF] bg-[#00F0FF]/5">
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-2">
            {moralLabel}
          </div>
          <p className="text-sm text-[#C8D0E0] leading-relaxed">{config.moral}</p>
        </div>
      )}

      {picked !== null && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8] hover:text-[#00F0FF] transition"
          >
            ↺ {resetLabel}
          </button>
        </div>
      )}
    </div>
  );
}
