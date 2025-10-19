import { useId, useMemo, useState } from 'react';
import { Locale, makeTranslator } from '../utils/i18n';

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

export default function ExamWidget({ config }: Props) {
  const tr = makeTranslator('exam');
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
      <section className="bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--brand)] mb-3">
          {heading}
        </div>
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">
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
      <section className="bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--brand)] mb-3">
          {heading}
          {' // '}
          {tr('result_suffix')}
        </div>

        {/* Clearance verdict */}
        <div
          className={`mt-2 p-4 sm:p-5 border rounded-[3px] ${
            passed
              ? 'border-[var(--success)] bg-[var(--success)]/8'
              : 'border-[var(--danger)] bg-[var(--danger)]/8'
          }`}
        >
          <div
            className={`font-mono text-[12px] sm:text-[14px] uppercase tracking-[0.18em] font-bold ${
              passed ? 'text-[var(--success)]' : 'text-[var(--danger)]'
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
              passed ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }`}
          >
            {score}/{total}
          </div>
        </div>

        <p className="mt-4 font-sans text-[16px] text-[var(--text-medium)] leading-relaxed max-w-[62ch]">
          {passed
            ? `${tr('score_passed_prefix')} ${pct100}${tr('score_passed_body', {
                threshold: Math.round(threshold * 100),
              })}`
            : `${tr('score_failed_prefix')} ${pct100}${tr('score_failed_body', {
                threshold: Math.round(threshold * 100),
              })}`}
        </p>

        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--brand)]">
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
                    correct ? 'border-[var(--success)]/40 bg-[var(--success)]/5' : 'border-[var(--danger)]/40 bg-[var(--danger)]/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                    <span className="text-[var(--muted)] tabular-nums">Q{(i + 1).toString().padStart(2, '0')}</span>
                    {q.module && <span className="text-[var(--text-soft)]">· {q.module}</span>}
                    <span className={correct ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                      · {correct ? correctLabel : incorrectLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 font-sans text-[16px] text-[var(--text)] leading-snug">{q.question}</div>
                  {!correct && q.choices.find((c) => c.correct) && (
                    <div className="mt-1.5 font-sans text-[16px] text-[var(--text-soft)]">
                      <span className="text-[var(--success)]">
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
            className="min-h-11 inline-flex items-center gap-2 px-4 py-2 font-mono uppercase text-[11px] tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--brand)] transition"
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
    <section className="bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--brand)]">
          {heading}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] tabular-nums">
          {progressLabel}{(index + 1).toString().padStart(2, '0')} / {total.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Progress bar — slats per question */}
      <div className="mb-5 flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => {
          let bg = 'bg-[var(--border)]';
          if (i < index) bg = 'bg-[var(--success)]';
          else if (i === index) bg = 'bg-[var(--brand)]';
          return <div key={i} className={`flex-1 h-[3px] ${bg} rounded-[1px]`} />;
        })}
      </div>

      {current && (
        <>
          {current.module && (
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
              {current.module}
            </div>
          )}
          <h3
            id={`${radioGroup}-question-${index}`}
            className="font-sans text-[var(--text)] text-[17px] sm:text-[18px] font-semibold leading-snug max-w-[62ch]"
          >
            {current.question}
          </h3>

          <fieldset
            aria-labelledby={`${radioGroup}-question-${index}`}
            className="mt-5 space-y-2.5"
            disabled={answeredThis}
          >
            {current.choices.map((choice, i) => {
              const isPicked = picked === i;
              const isCorrectShown = answeredThis && i === correctIndex;
              const isWrongShown = answeredThis && isPicked && !choice.correct;

              let stateClass: string;
              let badge: { text: string; cls: string } | null = null;
              if (isCorrectShown) {
                stateClass = 'border-[var(--success)] bg-[var(--success)]/10';
                badge = { text: correctLabel, cls: 'text-[var(--success)]' };
              } else if (isWrongShown) {
                stateClass = 'border-[var(--danger)] bg-[var(--danger)]/10';
                badge = { text: incorrectLabel, cls: 'text-[var(--danger)]' };
              } else if (isPicked) {
                stateClass = 'border-[var(--brand)] bg-[var(--brand)]/8';
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
                    name={`${radioGroup}q-${index}`}
                    value={i}
                    checked={isPicked}
                    onChange={() => setPicked(i)}
                    className="mt-1 accent-[var(--brand)] shrink-0"
                  />
                  <span className="flex-1 font-sans text-[16px] text-[var(--text-medium)] leading-relaxed">
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
                  ? 'border-[var(--success)]/40 bg-[var(--success)]/5'
                  : 'border-[var(--warning)]/40 bg-[var(--warning)]/5'
              }`}
            >
              <p className="font-sans text-[16px] text-[var(--text-medium)] leading-relaxed">
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
                className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[var(--brand-dim)]"
              >
                <span aria-hidden="true">▸</span> {submitLabel}
              </button>
            ) : isLast ? (
              <button
                type="button"
                onClick={finish}
                className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--success)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold"
              >
                {finishLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold"
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
