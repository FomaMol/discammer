import { useId, useState } from 'react';
import { Locale, makeTranslator } from '../utils/i18n';

export interface QuizChoice {
  text: string;
  correct?: boolean;
  explanation?: string;
}

export interface QuizConfig {
  question: string;
  choices: QuizChoice[];
  hint?: string;
}

interface Props {
  config: QuizConfig;
  locale: Locale;
}

export default function QuizWidget({ config }: Props) {
  const tr = makeTranslator('quiz');
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  // Unique per instance — pages can render several quizzes at once.
  const radioGroup = useId();

  const correctIndex = config.choices.findIndex((c) => c.correct);
  const isCorrect = checked && selected !== null && config.choices[selected]?.correct === true;

  function check() {
    if (selected === null) return;
    setChecked(true);
  }

  function reset() {
    setChecked(false);
    setSelected(null);
  }

  const headingLabel = tr('heading');
  const correctLabel = tr('correct');
  const incorrectLabel = tr('incorrect');
  const submitLabel = tr('submit');
  const tryAgainLabel = tr('try_again');
  const passedPill = tr('passed_pill');

  return (
    <section className="relative bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--brand)]">
          {headingLabel}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
          {config.choices.length} {tr('options_caption')}
        </div>
      </div>

      {/* Question — Geist sans, reads like prose */}
      <h3 className="font-sans text-[var(--text)] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]">
        {config.question}
      </h3>

      <fieldset className="mt-5 space-y-2.5" disabled={checked && isCorrect}>
        {config.choices.map((choice, i) => {
          const active = selected === i;
          const isCorrectShown = checked && i === correctIndex;
          const isWrongShown = checked && active && !choice.correct;

          let stateClass: string;
          let badge: { text: string; cls: string } | null = null;

          if (isCorrectShown) {
            stateClass = 'border-[var(--success)] bg-[var(--success)]/10';
            badge = { text: correctLabel, cls: 'text-[var(--success)]' };
          } else if (isWrongShown) {
            stateClass = 'border-[var(--danger)] bg-[var(--danger)]/10';
            badge = { text: incorrectLabel, cls: 'text-[var(--danger)]' };
          } else if (active) {
            stateClass = 'border-[var(--brand)] bg-[var(--brand)]/8 text-[var(--brand)]';
          } else {
            stateClass = 'border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand)]/5';
          }

          return (
            <label
              key={i}
              className={`relative flex items-start gap-3 p-3.5 sm:p-4 border cursor-pointer transition rounded-[3px] ${stateClass}`}
            >
              <input
                type="radio"
                name={radioGroup}
                value={i}
                checked={active}
                onChange={() => {
                  setSelected(i);
                  if (checked) setChecked(false);
                }}
                className="mt-1 accent-[var(--brand)] shrink-0"
              />
              <span
                className={`flex-1 font-sans text-[16px] leading-relaxed ${
                  active && !checked
                    ? 'text-[var(--brand)]'
                    : isCorrectShown
                    ? 'text-[var(--text)]'
                    : isWrongShown
                    ? 'text-[var(--text)]'
                    : 'text-[var(--text-medium)]'
                }`}
              >
                {choice.text}
              </span>
              {badge && (
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${badge.cls} pt-0.5`}
                >
                  {badge.text}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {/* Explanation — full hairline border, no side-stripe */}
      {checked && selected !== null && config.choices[selected]?.explanation && (
        <div
          className={`mt-4 p-4 border rounded-[3px] ${
            isCorrect
              ? 'border-[var(--success)]/40 bg-[var(--success)]/5'
              : 'border-[var(--warning)]/40 bg-[var(--warning)]/5'
          }`}
        >
          <p className="font-sans text-[16px] text-[var(--text-medium)] leading-relaxed">
            {config.choices[selected]?.explanation}
          </p>
        </div>
      )}
      {checked && !isCorrect && config.hint && (
        <p className="mt-3 font-sans text-[16px] text-[var(--text-soft)] italic">{config.hint}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isCorrect ? (
          <button
            type="button"
            onClick={check}
            disabled={selected === null}
            className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[var(--brand-dim)]"
          >
            <span aria-hidden="true">▸</span> {submitLabel}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)] rounded-[4px]">
            {passedPill}
          </span>
        )}
        {checked && !isCorrect && (
          <button
            type="button"
            onClick={reset}
            className="min-h-11 inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--text)] transition"
          >
            ↺ {tryAgainLabel}
          </button>
        )}
      </div>
    </section>
  );
}
