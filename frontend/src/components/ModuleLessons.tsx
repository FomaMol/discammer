import { useEffect, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import { getCurrentCompletedLessons, subscribe } from '../utils/progress';

interface Lesson {
  slug: string;
  order: number;
  title: string;
  est_minutes: number;
  widget_type: string | null;
  content_revision?: string | null;
}

interface Props {
  moduleSlug: string;
  locale: Locale;
}

/**
 * Module briefing checklist.
 *
 * Each row reads like a mission checklist line: `[ ]` (or `[✓]`) checkbox-style
 * mono char + uppercase tracked title + estimated minutes on the right. Hover
 * lifts the row to a cyan veil background. Widget-type tags get a tiny mono
 * caption underneath.
 */
export default function ModuleLessons({ moduleSlug, locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('moduleLessons');
  const commonTr = makeTranslator('common');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  // Fetch lessons.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/course/${encodeURIComponent(moduleSlug)}/lessons?lang=${lang}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: Lesson[]) => {
        if (!cancelled) setLessons(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleSlug, lang]);

  useEffect(() => {
    const fallback = document.getElementById('module-foundation');
    if (fallback) fallback.hidden = !loading && !error;
    return () => { if (fallback) fallback.hidden = false; };
  }, [loading, error]);

  // Subscribe to progress so completion ticks update without reload.
  useEffect(() => {
    const sync = () => setCompleted(new Set(getCurrentCompletedLessons(moduleSlug, lessons)));
    sync();
    return subscribe(sync);
  }, [moduleSlug, lessons]);

  const loadingLabel = tr('loading');
  const errorLabel = tr('error');
  const emptyLabel = tr('empty');
  const checklistHeader = tr('checklist_header');
  const openLabel = tr('open_label');

  if (loading) {
    return (
      <div className="text-center py-6 font-mono text-[13px] text-[var(--muted)]">
        {loadingLabel}
        <span className="cursor-blink" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[var(--panel)] border border-[var(--danger)]/40 p-5 text-sm text-[var(--danger)] font-sans rounded-[4px]">
        {errorLabel}
      </div>
    );
  }
  if (lessons.length === 0) {
    return (
      <div className="bg-[var(--panel)] border border-[var(--border)] p-6 text-center text-[var(--text-soft)] font-sans text-[15px] rounded-[4px]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="bg-[var(--canvas)] border border-[var(--border)] rounded-[4px] overflow-hidden">
      <div className="px-4 sm:px-5 py-2.5 border-b border-[var(--border)] bg-[var(--panel)]/60 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[var(--success)]">
          {checklistHeader}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
          {completed.size}/{lessons.length}
        </span>
      </div>
      <ol className="divide-y divide-[var(--border)]">
        {lessons.map((lesson) => {
          const isDone = completed.has(lesson.slug);
          return (
            <li key={lesson.slug}>
              <a
                href={`/${lang}/course/${moduleSlug}/${lesson.slug}`}
                className={`group flex items-center gap-2 sm:gap-5 px-3 sm:px-5 py-3.5 sm:py-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] focus-visible:bg-[var(--brand)]/8 ${
                  isDone ? 'hover:bg-[var(--success)]/5' : 'hover:bg-[var(--brand)]/8'
                }`}
              >
                {/* Checkbox-style mono char */}
                <span
                  className={`shrink-0 font-mono text-[14px] font-bold tabular-nums ${
                    isDone ? 'text-[var(--success)]' : 'text-[var(--muted)] group-hover:text-[var(--brand)]'
                  } transition-colors`}
                  aria-hidden="true"
                >
                  {isDone ? '[✓]' : '[ ]'}
                </span>

                {/* Order number — small mono ID-like */}
                <span
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums w-7 ${
                    isDone ? 'text-[var(--muted)]' : 'text-[var(--muted)] group-hover:text-[var(--brand)]'
                  }`}
                  aria-hidden="true"
                >
                  {lesson.order.toString().padStart(2, '0')}
                </span>

                {/* Title — mono uppercase tracked */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-mono font-semibold text-[16px] tracking-[0.01em] break-words leading-relaxed ${
                      isDone
                        ? 'text-[var(--text-soft)] group-hover:text-[var(--success)]'
                        : 'text-[var(--text)] group-hover:text-[var(--brand)]'
                    } transition-colors`}
                  >
                    {lesson.title}
                  </div>
                  {lesson.widget_type && (
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {lesson.widget_type === 'quiz' && tr('widget_quiz')}
                      {lesson.widget_type === 'scenario' && tr('widget_scenario')}
                      {lesson.widget_type === 'redflags' && tr('widget_redflags')}
                      {lesson.widget_type === 'exam' && tr('widget_exam')}
                      {lesson.widget_type === 'certificate' && tr('widget_certificate')}
                    </div>
                  )}
                </div>

                {/* Right side: time + completion */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] tabular-nums">
                    {lesson.est_minutes} {commonTr('min')}
                  </div>
                  <div
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums ${
                      isDone
                        ? 'text-[var(--success)]'
                        : 'text-[var(--brand-dim)] opacity-0 group-hover:opacity-100 transition-opacity'
                    }`}
                  >
                    {isDone ? commonTr('completed') : openLabel}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
