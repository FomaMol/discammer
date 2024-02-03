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
  const failedLabel = pick(lang, { en: 'Below threshold', ru: 'Ниже порога' });

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
      <div className="bg-[#131829] border border-[#1E2A42] p-6">
        <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-3">
          {heading} // {pick(lang, { en: 'RESULT', ru: 'РЕЗУЛЬТАТ' })}
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <div
            className={`font-['Press_Start_2P'] text-3xl sm:text-4xl ${
              passed ? 'text-[#39FF6B] glow-green' : 'text-[#FFB547] glow-amber'
            }`}
          >
            {score}/{total}
          </div>
          <div
            className={`font-['JetBrains_Mono'] text-sm uppercase tracking-[3px] ${
              passed ? 'text-[#39FF6B]' : 'text-[#FFB547]'
            }`}
          >
            {passed ? passedLabel : failedLabel}
          </div>
        </div>
        <p className="mt-4 text-sm text-[#C8D0E0] leading-relaxed">
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
          <summary className="cursor-pointer font-['JetBrains_Mono'] text-[11px] uppercase tracking-[2px] text-[#8892A8] hover:text-[#00F0FF]">
            {pick(lang, { en: 'Review answers', ru: 'Разбор ответов' })}
          </summary>
          <ol className="mt-3 space-y-3">
            {questions.map((q, i) => {
              const userIdx = answers[i];
              const correct = q.choices[userIdx]?.correct === true;
              return (
                <li key={i} className="border-l-2 pl-3 border-[#1E2A42]">
                  <div className="text-[11px] font-['JetBrains_Mono'] text-[#4A5568]">
                    Q{i + 1} {q.module ? `· ${q.module}` : ''} {correct ? '· ✓' : '· ✗'}
                  </div>
                  <div className="text-sm text-[#E4E8F1] mt-0.5">{q.question}</div>
                  {!correct && q.choices.find((c) => c.correct) && (
                    <div className="mt-1 text-xs text-[#8892A8]">
                      <span className="text-[#39FF6B]">
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
            className="inline-flex items-center gap-2 px-4 py-2 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] text-[#8892A8] hover:text-[#00F0FF] transition"
          >
            ↺ {restartLabel}
          </button>
        </div>
      </div>
    );
  }

  const answeredThis = answers.length > index;
  const correctIndex = current?.choices.findIndex((c) => c.correct) ?? -1;
  const isLast = index === total - 1;

  return (
    <div className="bg-[#131829] border border-[#1E2A42] p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF]">
          {heading}
        </div>
        <div className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[2px] text-[#8892A8]">
          {progressLabel} {index + 1}/{total}
        </div>
      </div>

      {/* Bar */}
      <div className="h-1 bg-[#0B0E17] border border-[#1E2A42] mb-5 overflow-hidden">
        <div
          className="h-full bg-[#00F0FF] transition-all"
          style={{ width: `${((index + (answeredThis ? 1 : 0)) / total) * 100}%` }}
        />
      </div>

      {current && (
        <>
          {current.module && (
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568] mb-2">
              {current.module}
            </div>
          )}
          <h3 className="text-[#E4E8F1] text-base sm:text-lg font-semibold leading-snug">
            {current.question}
          </h3>

          <fieldset className="mt-5 space-y-2.5" disabled={answeredThis}>
            {current.choices.map((choice, i) => {
              const isPicked = picked === i;
              const showCorrect = answeredThis && i === correctIndex;
              const showWrong = answeredThis && isPicked && !choice.correct;

              const cls = showCorrect
                ? 'border-[#39FF6B] bg-[#39FF6B]/5'
                : showWrong
                ? 'border-[#FF4757] bg-[#FF4757]/5'
                : isPicked
                ? 'border-[#00F0FF] bg-[#00F0FF]/5'
                : 'border-[#1E2A42] hover:border-[#00F0FF]/40';

              return (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3.5 border cursor-pointer transition ${cls}`}
                >
                  <input
                    type="radio"
                    name={`q-${index}`}
                    value={i}
                    checked={isPicked}
                    onChange={() => setPicked(i)}
                    className="mt-1 accent-[#00F0FF]"
                  />
                  <span className="flex-1 text-sm text-[#C8D0E0] leading-relaxed">
                    {choice.text}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {answeredThis && current.choices[answers[index]]?.explanation && (
            <div
              className={`mt-4 p-3 border-l-2 ${
                current.choices[answers[index]]?.correct
                  ? 'border-[#39FF6B] bg-[#39FF6B]/5'
                  : 'border-[#FFB547] bg-[#FFB547]/5'
              }`}
            >
              <p className="text-sm text-[#C8D0E0] leading-relaxed">
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
                className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitLabel}
              </button>
            ) : isLast ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#39FF6B]/5 border border-[#39FF6B] text-[#39FF6B] hover:bg-[#39FF6B]/10 transition"
              >
                {finishLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/10 transition"
              >
                {nextLabel} →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
