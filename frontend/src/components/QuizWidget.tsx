import { useState } from 'react';
import { Locale, STRINGS, normalizeLocale, t } from '../utils/i18n';

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

  return (
    <div className="relative bg-[#131829] border border-[#1E2A42] p-5 sm:p-6">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-3">
        // {lang === 'ru' ? 'ПРОВЕРКА' : 'KNOWLEDGE CHECK'}
      </div>
      <h3 className="text-[#E4E8F1] text-base sm:text-lg font-semibold leading-snug">
        {config.question}
      </h3>

      <fieldset className="mt-5 space-y-2.5" disabled={checked && isCorrect}>
        {config.choices.map((choice, i) => {
          const active = selected === i;
          const showCorrect = checked && i === correctIndex;
          const showWrong = checked && active && !choice.correct;

          const baseBorder = showCorrect
            ? 'border-[#39FF6B] bg-[#39FF6B]/5'
            : showWrong
            ? 'border-[#FF4757] bg-[#FF4757]/5'
            : active
            ? 'border-[#00F0FF] bg-[#00F0FF]/5'
            : 'border-[#1E2A42] hover:border-[#00F0FF]/40';

          return (
            <label
              key={i}
              className={`flex items-start gap-3 p-3.5 border cursor-pointer transition ${baseBorder}`}
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
                className="mt-1 accent-[#00F0FF]"
              />
              <span className="flex-1 text-sm text-[#C8D0E0] leading-relaxed">{choice.text}</span>
              {showCorrect && (
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#39FF6B] shrink-0">
                  ✓ {t(STRINGS.quizCorrect, lang)}
                </span>
              )}
              {showWrong && (
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#FF4757] shrink-0">
                  ✗ {t(STRINGS.quizWrong, lang)}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {/* Explanation appears when the user has checked their answer */}
      {checked && selected !== null && config.choices[selected]?.explanation && (
        <div
          className={`mt-4 p-4 border-l-2 ${
            isCorrect ? 'border-[#39FF6B] bg-[#39FF6B]/5' : 'border-[#FFB547] bg-[#FFB547]/5'
          }`}
        >
          <p className="text-sm text-[#C8D0E0] leading-relaxed">
            {config.choices[selected]?.explanation}
          </p>
        </div>
      )}
      {checked && !isCorrect && config.hint && (
        <p className="mt-3 text-xs text-[#8892A8] italic">{config.hint}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!isCorrect ? (
          <button
            type="button"
            onClick={check}
            disabled={selected === null}
            className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t(STRINGS.quizCheck, lang)}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#39FF6B]/10 border border-[#39FF6B] text-[#39FF6B]">
            ✓ {t(STRINGS.quizCorrect, lang)}
          </span>
        )}
        {checked && !isCorrect && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] text-[#8892A8] hover:text-[#E4E8F1] transition"
          >
            {t(STRINGS.quizTryAgain, lang)}
          </button>
        )}
      </div>
    </div>
  );
}
