import { useId, useMemo, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';

const BUNDLES = {
  en: {
    heading: '// FINAL EXAMINATION',
    progress_label: 'Q',
    transmit: 'TRANSMIT',
    next: 'NEXT QUESTION ▷',
    finish: 'FINALIZE EXAM ▷',
    restart: 'Re-run examination',
    correct: '[OK] CORRECT',
    incorrect: '[FAIL] INCORRECT',
    review: 'Inspect transmission log',
    empty: '[STANDBY] No exam questions loaded.',
    result_suffix: 'TRANSMISSION REPORT',
    clearance_granted_prefix: 'CLEARANCE GRANTED · LEVEL',
    clearance_granted_suffix: '/100',
    clearance_denied: 'CLEARANCE DENIED · RETRY REQUIRED',
    review_correct_label: 'Expected:',
    score_passed_prefix: 'Score:',
    score_passed_body:
      ', at or above the {threshold}% pass mark. Result is recorded and visible on the clearance page.',
    score_failed_prefix: 'Score:',
    score_failed_body:
      ', below the {threshold}% pass mark. Review the missed areas in the log below and re-transmit when ready.',
  },
  ru: {
    heading: '// ФИНАЛЬНОЕ ИСПЫТАНИЕ',
    progress_label: 'В',
    transmit: 'ОТПРАВИТЬ',
    next: 'СЛЕДУЮЩИЙ ▷',
    finish: 'ЗАВЕРШИТЬ ЭКЗАМЕН ▷',
    restart: 'Пройти заново',
    correct: '[OK] ВЕРНО',
    incorrect: '[FAIL] НЕВЕРНО',
    review: 'Открыть лог передачи',
    empty: '[STANDBY] Вопросы экзамена не загружены.',
    result_suffix: 'ОТЧЁТ О ПЕРЕДАЧЕ',
    clearance_granted_prefix: 'ДОПУСК ВЫДАН · УРОВЕНЬ',
    clearance_granted_suffix: '/100',
    clearance_denied: 'В ДОПУСКЕ ОТКАЗАНО · НУЖНА ПОВТОРНАЯ ПОПЫТКА',
    review_correct_label: 'Ожидалось:',
    score_passed_prefix: 'Результат',
    score_passed_body:
      '% — это проходной порог {threshold}% или выше. Результат сохранён и виден на странице допуска.',
    score_failed_prefix: 'Результат',
    score_failed_body:
      '% — ниже порога {threshold}%. Разбери пропуски в логе ниже и пройди снова, когда будешь готов.',
  },
} as const;

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

function readStoredResult(): PersistedExam | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedExam;
    return typeof parsed?.passed === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}

export default function ExamWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator(lang, BUNDLES);
  const radioGroup = useId();

  // Bumped on restart so a retake gets a fresh shuffle, not the mount-time order.
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Stable display order per attempt, optionally shuffled.
  const questions = useMemo(() => {
    if (!config.shuffle) return config.questions;
    const arr = [...config.questions];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [config.questions, config.shuffle, shuffleSeed]);

  const threshold = config.passThreshold ?? 0.8;

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const total = questions.length;
  const current = questions[index];

  const heading = tr('heading');
  const progressLabel = tr('progress_label');
  const submitLabel = tr('transmit');
  const nextLabel = tr('next');
  const finishLabel = tr('finish');
  const restartLabel = tr('restart');
  const correctLabel = tr('correct');
  const incorrectLabel = tr('incorrect');
  const reviewLabel = tr('review');

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
    // Best-of persistence: a failed or weaker retake must not revoke a stored
    // pass — certificate eligibility hangs off this record.
    const stored = readStoredResult();
    const storedRatio = stored && stored.total > 0 ? stored.score / stored.total : 0;
    const keepStored =
      stored?.passed === true && (!passed || score / total < storedRatio);
    if (!keepStored) {
      persistResult({
        passed,
        score,
        total,
        passedAt: new Date().toISOString(),
      });
    }
    setFinished(true);
  }

  function restart() {
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setFinished(false);
    setShuffleSeed((s) => s + 1);
  }

  if (total === 0) {
    return (
      <section className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#65def0] mb-3">
          {heading}
        </div>
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#6b7588]">
          {tr('empty')}
        </p>
      </section>
    );
  }

  if (finished) {
    const score = answers.filter((a, i) => questions[i].choices[a]?.correct).length;
    const ratio = total > 0 ? score / total : 0;
    const passed = ratio >= threshold;
    const pct100 = Math.round(ratio * 100);

    return (
      <section className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#65def0] mb-3">
          {heading}
          {' // '}
          {tr('result_suffix')}
        </div>

        {/* Clearance verdict */}
        <div
          className={`mt-2 p-4 sm:p-5 border rounded-[3px] ${
            passed
              ? 'border-[#7ce896] bg-[#7ce896]/8'
              : 'border-[#e76670] bg-[#e76670]/8'
          }`}
        >
          <div
            className={`font-mono text-[12px] sm:text-[14px] uppercase tracking-[0.18em] font-bold ${
              passed ? 'text-[#7ce896]' : 'text-[#e76670]'
            }`}
          >
            {passed ? (
              <>
                <span aria-hidden="true">▶</span>{' '}
                {tr('clearance_granted_prefix')} {pct100}{tr('clearance_granted_suffix')}
              </>
            ) : (
              <>
                <span aria-hidden="true">✗</span>{' '}
                {tr('clearance_denied')}
              </>
            )}
          </div>
          <div
            className={`mt-2 font-mono text-2xl sm:text-3xl tabular-nums font-extrabold ${
              passed ? 'text-[#7ce896]' : 'text-[#e76670]'
            }`}
          >
            {score}/{total}
          </div>
        </div>

        <p className="mt-4 font-sans text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
          {passed
            ? `${tr('score_passed_prefix')} ${pct100}${tr('score_passed_body', {
                threshold: Math.round(threshold * 100),
              })}`
            : `${tr('score_failed_prefix')} ${pct100}${tr('score_failed_body', {
                threshold: Math.round(threshold * 100),
              })}`}
        </p>

        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0]">
            ▸ {reviewLabel}
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
                      · {correct ? correctLabel : incorrectLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 font-sans text-[14px] text-[#e7ecf5] leading-snug">{q.question}</div>
                  {!correct && q.choices.find((c) => c.correct) && (
                    <div className="mt-1.5 font-sans text-[13px] text-[#aab2c4]">
                      <span className="text-[#7ce896]">
                        {tr('review_correct_label')}
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
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#65def0]">
          {heading}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
          {progressLabel}{(index + 1).toString().padStart(2, '0')} / {total.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Progress bar — slats per question */}
      <div className="mb-5 flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => {
          let bg = 'bg-[#202a44]';
          if (i < index) bg = 'bg-[#7ce896]';
          else if (i === index) bg = 'bg-[#65def0]';
          return <div key={i} className={`flex-1 h-[3px] ${bg} rounded-[1px]`} />;
        })}
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
                badge = { text: correctLabel, cls: 'text-[#7ce896]' };
              } else if (isWrongShown) {
                stateClass = 'border-[#e76670] bg-[#e76670]/10';
                badge = { text: incorrectLabel, cls: 'text-[#e76670]' };
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
                    name={`${radioGroup}q-${index}`}
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
                <span aria-hidden="true">▸</span> {submitLabel}
              </button>
            ) : isLast ? (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold"
              >
                {finishLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] transition rounded-[4px] font-bold"
              >
                {nextLabel}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
