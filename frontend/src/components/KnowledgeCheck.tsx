import { useId, useMemo, useState } from 'react';
import { Locale, makeTranslator } from '../utils/i18n';
import { GUIDE_QUIZZES, OPTION_KEYS, scoreQuiz } from '../data/quizzes';
import { recordGuideCheck } from '../utils/progress';

/**
 * KnowledgeCheck (Task F1) — the short recall check at the bottom of every scam
 * guide. Single-best-answer questions drawn from the guide's own content; recall
 * beats re-reading. 100% client-side: the result folds into the v4 dossier via
 * `recordGuideCheck` (best-of by slug) and rides along with the existing course
 * export/import. No accounts, no backend writes.
 *
 * Mirrors the established Quiz/Exam island patterns: `useId` radio groups,
 * reduced-motion-safe (no animation introduced), an `aria-live` region announcing
 * the per-attempt result, and full keyboard navigation (native radios + buttons).
 *
 * Copy lives in the locale files, not here. Shared UI strings reuse the existing
 * `client.quiz.*` namespace; per-guide question content is authored under
 * `client.quiz.guides.<slug>.<qid>.{prompt,opt_a,opt_b,opt_c,tell}`.
 */

interface Props {
  /** Seeded guide slug — selects the question pack and the i18n sub-namespace. */
  slug: string;
  /** Active locale (passed for parity with sibling islands; copy is pre-resolved). */
  locale?: Locale;
  /** Guide URL the "review" link points back to (rendered by the server). */
  guideUrl?: string;
}

export default function KnowledgeCheck({ slug, guideUrl }: Props) {
  const tr = makeTranslator('quiz');
  const groupBase = useId();

  const quiz = GUIDE_QUIZZES[slug];

  // One picked option index per question (null = unanswered).
  const [picks, setPicks] = useState<(number | null)[]>(() =>
    quiz ? quiz.questions.map(() => null) : [],
  );
  const [submitted, setSubmitted] = useState(false);

  const total = quiz ? quiz.questions.length : 0;
  const score = useMemo(
    () => (quiz ? scoreQuiz(quiz, picks) : 0),
    [quiz, picks],
  );
  const allAnswered = picks.length > 0 && picks.every((p) => p !== null);

  // Defensive: an unknown slug renders nothing (the noscript fallback in the
  // template still gives the reader a static "check yourself" list).
  if (!quiz || total === 0) return null;

  const heading = tr('guides_heading');
  const eyebrow = tr('guides_eyebrow');
  const submitLabel = tr('submit');
  const retryLabel = tr('try_again');
  const correctLabel = tr('correct');
  const incorrectLabel = tr('incorrect');
  const tellLabel = tr('guides_tell_label');
  const reviewLinkLabel = tr('guides_review_link');
  // `guides_score` is authored with {score} / {total} placeholders.
  const scoreText = tr('guides_score', { score, total });

  function pick(qIndex: number, optIndex: number) {
    setPicks((prev) => {
      const next = [...prev];
      next[qIndex] = optIndex;
      return next;
    });
    // Editing an answer after submission re-opens the attempt (no penalty).
    if (submitted) setSubmitted(false);
  }

  function submit() {
    if (!allAnswered) return;
    setSubmitted(true);
    recordGuideCheck(slug, score, total);
  }

  function retry() {
    setPicks(quiz.questions.map(() => null));
    setSubmitted(false);
  }

  return (
    <section
      className="relative bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]"
      aria-labelledby={`${groupBase}-heading`}
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {eyebrow}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
          {total} {tr('options_caption')}
        </div>
      </div>
      <h2
        id={`${groupBase}-heading`}
        className="font-mono text-[16px] sm:text-[18px] font-bold uppercase tracking-[-0.01em] text-[var(--brand)] flex items-baseline gap-2"
      >
        <span className="text-[var(--brand)]" aria-hidden="true">&gt;</span>
        {heading}
      </h2>

      <ol className="mt-6 space-y-7 list-none">
        {quiz.questions.map((q, qi) => {
          const base = `guides.${slug}.${q.id}`;
          const picked = picks[qi];
          const radioGroup = `${groupBase}-${q.id}`;
          const qCorrect = submitted && picked === q.correct;

          return (
            <li key={q.id}>
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 font-mono text-[12px] text-[var(--muted)] tabular-nums pt-0.5">
                  {(qi + 1).toString().padStart(2, '0')}
                </span>
                <h3 className="font-sans text-[var(--text)] text-[16px] sm:text-[17px] font-semibold leading-snug max-w-[60ch]">
                  {tr(`${base}.prompt`)}
                </h3>
              </div>

              <fieldset
                className="mt-3.5 space-y-2.5 pl-7"
                aria-label={tr(`${base}.prompt`)}
              >
                {OPTION_KEYS.map((optKey, oi) => {
                  const active = picked === oi;
                  const showCorrect = submitted && oi === q.correct;
                  const showWrong = submitted && active && oi !== q.correct;

                  let stateClass: string;
                  let badge: { text: string; cls: string } | null = null;
                  if (showCorrect) {
                    stateClass = 'border-[var(--success)] bg-[var(--success)]/10';
                    badge = { text: correctLabel, cls: 'text-[var(--success)]' };
                  } else if (showWrong) {
                    stateClass = 'border-[var(--danger)] bg-[var(--danger)]/10';
                    badge = { text: incorrectLabel, cls: 'text-[var(--danger)]' };
                  } else if (active) {
                    stateClass = 'border-[var(--brand)] bg-[var(--brand)]/8';
                  } else {
                    stateClass =
                      'border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand)]/5';
                  }

                  return (
                    <label
                      key={optKey}
                      className={`relative flex items-start gap-3 p-3 sm:p-3.5 border cursor-pointer transition rounded-[3px] ${stateClass}`}
                    >
                      <input
                        type="radio"
                        name={radioGroup}
                        value={oi}
                        checked={active}
                        onChange={() => pick(qi, oi)}
                        className="mt-1 accent-[var(--brand)] shrink-0"
                      />
                      <span
                        className={`flex-1 font-sans text-[14px] sm:text-[15px] leading-relaxed ${
                          active && !submitted ? 'text-[var(--brand)]' : 'text-[var(--text-medium)]'
                        }`}
                      >
                        {tr(`${base}.${optKey}`)}
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

              {/* The tell — only for a MISSED question. Explains the signal,
                  never scolds, and links back to the guide section. */}
              {submitted && !qCorrect && (
                <div className="mt-3 ml-7 p-3.5 border border-[var(--warning)]/40 bg-[var(--warning)]/5 rounded-[3px]">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warning)] mb-1.5">
                    {tellLabel}
                  </div>
                  <p className="font-sans text-[14px] text-[var(--text-medium)] leading-relaxed max-w-[60ch]">
                    {tr(`${base}.tell`)}
                  </p>
                  {guideUrl && (
                    <a
                      href={guideUrl}
                      className="inline-flex items-center gap-1.5 mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand-dim)] hover:text-[var(--brand)] transition"
                    >
                      <span aria-hidden="true">↑</span> {reviewLinkLabel}
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Per-attempt result, announced to assistive tech. */}
      <div className="mt-6 flex flex-wrap items-center gap-3" aria-live="polite">
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[var(--brand-dim)]"
          >
            <span aria-hidden="true">▸</span> {submitLabel}
          </button>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[12px] tracking-[0.14em] tabular-nums rounded-[4px] border ${
                score === total
                  ? 'border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]'
                  : 'border-[var(--warning)] bg-[var(--warning)]/10 text-[var(--warning)]'
              }`}
            >
              {scoreText}
            </span>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--text)] transition"
            >
              ↺ {retryLabel}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
