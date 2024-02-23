import { useState } from 'react';
import { Locale, normalizeLocale, pick } from '../utils/i18n';

export interface QuizChoice {
  text: string;
  correct?: boolean;
  explanation?: string;
}

export interface QuizConfig {
  question: string;
  choices: QuizChoice[];
  hint?: string;
  /**
   * Optional onSolve callback hint — when the quiz is answered correctly the
   * widget fires `discammer:quizSolved` on window so the LessonFooter can
   * auto-suggest the next step. We do not require it to succeed.
   */
}

interface Props {
  config: QuizConfig;
  locale: Locale;
}

export default function QuizWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const correctIndex = config.choices.findIndex((c) => c.correct);
  const isCorrect = checked && selected !== null && config.choices[selected]?.correct === true;

  function check() {
    if (selected === null) return;
    setChecked(true);
    if (config.choices[selected]?.correct) {
      try {
        window.dispatchEvent(new CustomEvent('discammer:quizSolved'));
      } catch {
        /* noop */
      }
    }
  }

  function reset() {
    setChecked(false);
    setSelected(null);
  }

  // TODO: i18n key for quiz.heading
  const headingLabel = pick(lang, { en: '// ASSESSMENT', ru: '// ОЦЕНКА' });
  // TODO: i18n key for quiz.correct
  const correctLabel = pick(lang, { en: '[OK] CORRECT', ru: '[OK] ВЕРНО' });
  // TODO: i18n key for quiz.incorrect
  const incorrectLabel = pick(lang, { en: '[FAIL] INCORRECT', ru: '[FAIL] НЕВЕРНО' });
  // TODO: i18n key for quiz.submit
  const submitLabel = pick(lang, { en: 'SUBMIT ANSWERS', ru: 'ОТПРАВИТЬ ОТВЕТ' });
  // TODO: i18n key for quiz.try_again
  const tryAgainLabel = pick(lang, { en: 'Re-run assessment', ru: 'Пройти заново' });
  // TODO: i18n key for quiz.passed_pill
  const passedPill = pick(lang, { en: '✓ ASSESSMENT PASSED', ru: '✓ ОЦЕНКА СДАНА' });

  return (
    <section className="relative bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#65def0]">
          {headingLabel}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] tabular-nums">
          {config.choices.length} {pick(lang, { en: 'options', ru: 'вариантов' })}
          {/* TODO: i18n key for quiz.options_caption */}
        </div>
      </div>

      {/* Question — Geist sans, reads like prose */}
      <h3 className="font-sans text-[#e7ecf5] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]">
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
            stateClass = 'border-[#7ce896] bg-[#7ce896]/10';
            badge = { text: correctLabel, cls: 'text-[#7ce896]' };
          } else if (isWrongShown) {
            stateClass = 'border-[#e76670] bg-[#e76670]/10';
            badge = { text: incorrectLabel, cls: 'text-[#e76670]' };
          } else if (active) {
            stateClass = 'border-[#65def0] bg-[#65def0]/8 text-[#65def0]';
          } else {
            stateClass = 'border-[#202a44] hover:border-[#65def0] hover:bg-[#65def0]/5';
          }

          return (
            <label
              key={i}
              className={`relative flex items-start gap-3 p-3.5 sm:p-4 border cursor-pointer transition rounded-[3px] ${stateClass}`}
            >
              <input
                type="radio"
                name="quiz-choice"
                value={i}
                checked={active}
                onChange={() => {
                  setSelected(i);
                  if (checked) setChecked(false);
                }}
                className="mt-1 accent-[#65def0] shrink-0"
              />
              <span
                className={`flex-1 font-sans text-[15px] leading-relaxed ${
                  active && !checked
                    ? 'text-[#65def0]'
                    : isCorrectShown
                    ? 'text-[#e7ecf5]'
                    : isWrongShown
                    ? 'text-[#e7ecf5]'
                    : 'text-[#cdd4e3]'
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
              ? 'border-[#7ce896]/40 bg-[#7ce896]/5'
              : 'border-[#f4b965]/40 bg-[#f4b965]/5'
          }`}
        >
          <p className="font-sans text-[14px] text-[#cdd4e3] leading-relaxed">
            {config.choices[selected]?.explanation}
          </p>
        </div>
      )}
      {checked && !isCorrect && config.hint && (
        <p className="mt-3 font-sans text-[13px] text-[#aab2c4] italic">{config.hint}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isCorrect ? (
          <button
            type="button"
            onClick={check}
            disabled={selected === null}
            className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#3a8b9a]"
          >
            <span aria-hidden="true">▸</span> {submitLabel}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896]/10 border border-[#7ce896] text-[#7ce896] rounded-[4px]">
            {passedPill}
          </span>
        )}
        {checked && !isCorrect && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] text-[#aab2c4] hover:text-[#e7ecf5] transition"
          >
            ↺ {tryAgainLabel}
          </button>
        )}
      </div>
    </section>
  );
}
