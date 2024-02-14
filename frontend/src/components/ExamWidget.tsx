import { useMemo, useState } from 'react';
import { Locale, normalizeLocale, pick } from '../utils/i18n';

export interface ExamQuestion {
  module?: string;
  question: string;
  choices: { text: string; correct?: boolean; explanation?: string }[];
}

export interface ExamConfig {
  passThreshold?: number; // 0..1, default 0.8
  shuffle?: boolean;
  questions: ExamQuestion[];
}

interface Props {
  config: ExamConfig;
  locale: Locale;
}

const STORAGE_KEY = 'discammer:exam:v1';

interface PersistedExam {
  passed: boolean;
  score: number;
  total: number;
  passedAt: string;
}

function persistResult(payload: PersistedExam) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('discammer:exam'));
  } catch {
    /* noop */
  }
}

export default function ExamWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);

  // Stable display order, optionally shuffled once on mount.
  const questions = useMemo(() => {
    if (!config.shuffle) return config.questions;
    const arr = [...config.questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [config.questions, config.shuffle]);

  const threshold = config.passThreshold ?? 0.8;

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const total = questions.length;
  const current = questions[index];

  const heading = pick(lang, { en: '// FINAL EXAM', ru: '// ФИНАЛЬНЫЙ ЭКЗАМЕН' });
  const progressLabel = pick(lang, { en: 'Question', ru: 'Вопрос' });
  const submitLabel = pick(lang, { en: 'Submit answer', ru: 'Ответить' });
  const nextLabel = pick(lang, { en: 'Next question', ru: 'Следующий' });
  const finishLabel = pick(lang, { en: 'Finish exam', ru: 'Завершить' });
  const restartLabel = pick(lang, { en: 'Restart exam', ru: 'Пройти заново' });
  const passedLabel = pick(lang, { en: 'PASSED', ru: 'ЗАЧЁТ' });
  const failedLabel = pick(lang, { en: 'BELOW THRESHOLD', ru: 'НИЖЕ ПОРОГА' });
  const correctLabel = pick(lang, { en: 'CORRECT', ru: 'ВЕРНО' });
  const incorrectLabel = pick(lang, { en: 'INCORRECT', ru: 'НЕВЕРНО' });

  function submit() {
    if (picked === null) return;
    setAnswers((prev) => [...prev, picked]);
  }

  function next() {
    setPicked(null);
    setIndex((i) => i + 1);
  }

  function finish() {
    const score = answers.filter((a, i) => questions[i].choices[a]?.correct).length;
    const passed = total > 0 && score / total >= threshold;
    persistResult({
      passed,
      score,
      total,
      passedAt: new Date().toISOString(),
    });
    setFinished(true);
  }

  function restart() {
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setFinished(false);
  }

  if (finished) {
    const score = answers.filter((a, i) => questions[i].choices[a]?.correct).length;
    const ratio = total > 0 ? score / total : 0;
    const passed = ratio >= threshold;

    return (
      <section className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#65def0] mb-3">
          {heading} // {pick(lang, { en: 'RESULT', ru: 'РЕЗУЛЬТАТ' })}
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <div
            className={`font-mono font-bold text-3xl sm:text-4xl tabular-nums ${
              passed ? 'text-[#7ce896]' : 'text-[#f4b965]'
            }`}
          >
            {score}/{total}
          </div>
          <div
            className={`font-mono text-[13px] uppercase tracking-[0.18em] ${
              passed ? 'text-[#7ce896]' : 'text-[#f4b965]'
            }`}
          >
            {passed ? passedLabel : failedLabel}
          </div>
        </div>
        <p className="mt-4 font-sans text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
          {passed
            ? pick(lang, {
                en: `You scored ${Math.round(ratio * 100)}% — at or above the ${Math.round(
                  threshold * 100,
                )}% pass mark. Your exam result is recorded for the certificate page.`,
                ru: `Результат ${Math.round(ratio * 100)}% — это на проходном пороге ${Math.round(
                  threshold * 100,
                )}% или выше. Зачёт сохранён для страницы сертификата.`,
              })
            : pick(lang, {
                en: `You scored ${Math.round(ratio * 100)}% — below the ${Math.round(
                  threshold * 100,
                )}% pass mark. Review the missed areas and run the exam again when you're ready.`,
                ru: `Результат ${Math.round(ratio * 100)}% — ниже проходного порога ${Math.round(
                  threshold * 100,
                )}%. Перечитай тему по пропущенным вопросам и проходи снова.`,
              })}
        </p>
        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0]">
            {pick(lang, { en: 'Review answers', ru: 'Разбор ответов' })}
          </summary>
          <ol className="mt-3 space-y-3">
            {questions.map((q, i) => {
              const userIdx = answers[i];
              const correct = q.choices[userIdx]?.correct === true;
              return (
                <li
                  key={i}
                  className={`p-3 border rounded-[3px] ${
                    correct ? 'border-[#7ce896]/40 bg-[#7ce896]/5' : 'border-[#e76670]/40 bg-[#e76670]/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                    <span className="text-[#6b7588] tabular-nums">Q{(i + 1).toString().padStart(2, '0')}</span>
                    {q.module && <span className="text-[#aab2c4]">· {q.module}</span>}
                    <span className={correct ? 'text-[#7ce896]' : 'text-[#e76670]'}>
                      · {correct ? `✓ ${correctLabel}` : `✗ ${incorrectLabel}`}
                    </span>
                  </div>
                  <div className="mt-1.5 font-sans text-[14px] text-[#e7ecf5] leading-snug">{q.question}</div>
                  {!correct && q.choices.find((c) => c.correct) && (
                    <div className="mt-1.5 font-sans text-[13px] text-[#aab2c4]">
                      <span className="text-[#7ce896]">
                        {pick(lang, { en: 'Correct:', ru: 'Верно:' })}
                      </span>{' '}
                      {q.choices.find((c) => c.correct)?.text}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
        <div className="mt-5">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 px-4 py-2 font-mono uppercase text-[11px] tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0] transition"
          >
            ↺ {restartLabel}
          </button>
        </div>
      </section>
    );
  }

  const answeredThis = answers.length > index;
  const correctIndex = current?.choices.findIndex((c) => c.correct) ?? -1;
  const isLast = index === total - 1;

  return (
    <section className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#65def0]">
          {heading}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
          {progressLabel} {(index + 1).toString().padStart(2, '0')}/{total.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-[#0b0f1a] border border-[#202a44] mb-5 overflow-hidden">
        <div
          className="h-full bg-[#65def0] transition-all duration-300"
          style={{ width: `${((index + (answeredThis ? 1 : 0)) / total) * 100}%` }}
        />
      </div>

      {current && (
        <>
          {current.module && (
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] mb-2">
              {current.module}
            </div>
          )}
          <h3 className="font-sans text-[#e7ecf5] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]">
            {current.question}
          </h3>

          <fieldset className="mt-5 space-y-2.5" disabled={answeredThis}>
            {current.choices.map((choice, i) => {
              const isPicked = picked === i;
              const isCorrectShown = answeredThis && i === correctIndex;
              const isWrongShown = answeredThis && isPicked && !choice.correct;

              let stateClass: string;
              let badge: { text: string; cls: string } | null = null;
              if (isCorrectShown) {
                stateClass = 'border-[#7ce896] bg-[#7ce896]/10';
                badge = { text: `✓ ${correctLabel}`, cls: 'text-[#7ce896]' };
              } else if (isWrongShown) {
                stateClass = 'border-[#e76670] bg-[#e76670]/10';
                badge = { text: `✗ ${incorrectLabel}`, cls: 'text-[#e76670]' };
              } else if (isPicked) {
                stateClass = 'border-[#65def0] bg-[#65def0]/8';
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
                    name={`q-${index}`}
                    value={i}
                    checked={isPicked}
                    onChange={() => setPicked(i)}
                    className="mt-1 accent-[#65def0] shrink-0"
                  />
                  <span className="flex-1 font-sans text-[15px] text-[#cdd4e3] leading-relaxed">
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

          {answeredThis && current.choices[answers[index]]?.explanation && (
            <div
              className={`mt-4 p-3 border rounded-[3px] ${
                current.choices[answers[index]]?.correct
                  ? 'border-[#7ce896]/40 bg-[#7ce896]/5'
                  : 'border-[#f4b965]/40 bg-[#f4b965]/5'
              }`}
            >
              <p className="font-sans text-[14px] text-[#cdd4e3] leading-relaxed">
                {current.choices[answers[index]]?.explanation}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {!answeredThis ? (
              <button
                type="button"
                onClick={submit}
                disabled={picked === null}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#3a8b9a]"
              >
                {submitLabel} <span aria-hidden="true">▸</span>
              </button>
            ) : isLast ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold"
              >
                {finishLabel} <span aria-hidden="true">▸</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold"
              >
                {nextLabel} →
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
