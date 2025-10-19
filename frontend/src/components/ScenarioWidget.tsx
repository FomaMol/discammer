import { useState } from 'react';
import { Locale, makeTranslator } from '../utils/i18n';

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

type OutcomeKey = 'outcome_optimal' | 'outcome_compromised' | 'outcome_mission_failed';

const OUTCOME_STYLES: Record<
  Outcome,
  { border: string; bg: string; text: string; symbol: string; labelKey: OutcomeKey }
> = {
  good: {
    border: 'border-[var(--success)]',
    bg: 'bg-[var(--success)]/10',
    text: 'text-[var(--success)]',
    symbol: '▶',
    labelKey: 'outcome_optimal',
  },
  risky: {
    border: 'border-[var(--warning)]',
    bg: 'bg-[var(--warning)]/10',
    text: 'text-[var(--warning)]',
    symbol: '▲',
    labelKey: 'outcome_compromised',
  },
  disaster: {
    border: 'border-[var(--danger)]',
    bg: 'bg-[var(--danger)]/10',
    text: 'text-[var(--danger)]',
    symbol: '✗',
    labelKey: 'outcome_mission_failed',
  },
};

export default function ScenarioWidget({ config }: Props) {
  const tr = makeTranslator('scenario');
  const [picked, setPicked] = useState<number | null>(null);

  const headingLabel = tr('heading');
  const promptDefault = tr('prompt_default');
  const resetLabel = tr('reset');
  const moralLabel = tr('moral');

  return (
    <section className="relative bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--brand)] mb-3">
        {headingLabel}
      </div>

      {config.setup && (
        <p className="font-sans text-[16px] text-[var(--text-medium)] leading-relaxed max-w-[62ch]">
          {config.setup}
        </p>
      )}

      <p className="mt-4 font-sans text-[var(--text)] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]">
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
            stateClass = 'border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand)]/5';
          } else {
            stateClass = 'border-[var(--border)] opacity-50';
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              disabled={picked !== null && picked !== i}
              aria-pressed={isPicked}
              className={`min-h-11 w-full text-left p-4 border transition rounded-[3px] ${stateClass} ${
                picked !== null && picked !== i ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 font-sans text-[16px] text-[var(--text)] leading-relaxed">
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
                <p className="mt-3 font-sans text-[16px] text-[var(--text-medium)] leading-relaxed">
                  {choice.explanation}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {picked !== null && config.moral && (
        <div className="mt-5 p-4 border border-[var(--brand)]/40 bg-[var(--brand)]/5 rounded-[3px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--brand)] mb-2">
            {moralLabel}
          </div>
          <p className="font-sans text-[16px] text-[var(--text-medium)] leading-relaxed">{config.moral}</p>
        </div>
      )}

      {picked !== null && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="min-h-11 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--brand)] transition"
          >
            ↺ {resetLabel}
          </button>
        </div>
      )}
    </section>
  );
}
