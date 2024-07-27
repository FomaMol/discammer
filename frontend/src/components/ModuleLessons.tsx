import { useEffect, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import { getCompletedLessons, subscribe } from '../utils/progress';

interface Lesson {
  slug: string;
  order: number;
  title: string;
  est_minutes: number;
  widget_type: string | null;
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
    fetch(`/api/course/${encodeURIComponent(moduleSlug)}/lessons?lang=${lang}`)
      .then((r) => r.json())
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

  // Subscribe to progress so completion ticks update without reload.
  useEffect(() => {
    const sync = () => setCompleted(new Set(getCompletedLessons(moduleSlug)));
    sync();
    return subscribe(sync);
  }, [moduleSlug]);

  const loadingLabel = tr('loading');
  const errorLabel = tr('error');
  const emptyLabel = tr('empty');
  const checklistHeader = tr('checklist_header');
  const openLabel = tr('open_label');

  if (loading) {
    return (
      <div className="text-center py-6 font-mono text-[13px] text-[#8b94a8]">
        {loadingLabel}
        <span className="cursor-blink" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[#121828] border border-[#e76670]/40 p-5 text-sm text-[#e76670] font-sans rounded-[4px]">
        {errorLabel}
      </div>
    );
  }
  if (lessons.length === 0) {
    return (
      <div className="bg-[#121828] border border-[#202a44] p-6 text-center text-[#aab2c4] font-sans text-[15px] rounded-[4px]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="bg-[#0b0f1a] border border-[#202a44] rounded-[4px] overflow-hidden">
      <div className="px-4 sm:px-5 py-2.5 border-b border-[#202a44] bg-[#121828]/60 flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[#7ce896]">
          {checklistHeader}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b94a8] tabular-nums">
          {completed.size}/{lessons.length}
        </span>
      </div>
      <ol className="divide-y divide-[#202a44]">
        {lessons.map((lesson) => {
          const isDone = completed.has(lesson.slug);
          return (
            <li key={lesson.slug}>
              <a
                href={`/${lang}/course/${moduleSlug}/${lesson.slug}`}
                className={`group flex items-center gap-4 sm:gap-5 px-4 sm:px-5 py-3.5 sm:py-4 transition focus-visible:outline-none focus-visible:bg-[#65def0]/8 ${
                  isDone ? 'hover:bg-[#7ce896]/5' : 'hover:bg-[#65def0]/8'
                }`}
              >
                {/* Checkbox-style mono char */}
                <span
                  className={`shrink-0 font-mono text-[14px] font-bold tabular-nums ${
                    isDone ? 'text-[#7ce896]' : 'text-[#8b94a8] group-hover:text-[#65def0]'
                  } transition-colors`}
                  aria-hidden="true"
                >
                  {isDone ? '[✓]' : '[ ]'}
                </span>

                {/* Order number — small mono ID-like */}
                <span
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums w-7 ${
                    isDone ? 'text-[#8b94a8]' : 'text-[#8b94a8] group-hover:text-[#65def0]'
                  }`}
                  aria-hidden="true"
                >
                  {lesson.order.toString().padStart(2, '0')}
                </span>

                {/* Title — mono uppercase tracked */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-mono font-semibold text-[13px] sm:text-[14px] uppercase tracking-[0.04em] truncate ${
                      isDone
                        ? 'text-[#aab2c4] group-hover:text-[#7ce896]'
                        : 'text-[#e7ecf5] group-hover:text-[#65def0]'
                    } transition-colors`}
                  >
                    {lesson.title}
                  </div>
                  {lesson.widget_type && (
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b94a8]">
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
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
                    {lesson.est_minutes} {commonTr('min')}
                  </div>
                  <div
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums ${
                      isDone
                        ? 'text-[#7ce896]'
                        : 'text-[#3a8b9a] opacity-0 group-hover:opacity-100 transition-opacity'
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
