import { useEffect, useState } from 'react';
import { Locale, STRINGS, normalizeLocale, t } from '../utils/i18n';
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

export default function ModuleLessons({ moduleSlug, locale }: Props) {
  const lang = normalizeLocale(locale);
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

  if (loading) {
    return (
      <div className="text-center py-6 font-['JetBrains_Mono'] text-sm text-[#4A5568]">
        {lang === 'ru' ? '> Загрузка уроков...' : '> Loading lessons...'}
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[#131829] border border-[#FF4757]/40 p-5 text-sm text-[#FF4757]">
        {lang === 'ru' ? 'Не удалось загрузить уроки.' : 'Failed to load lessons.'}
      </div>
    );
  }
  if (lessons.length === 0) {
    return (
      <div className="bg-[#131829] border border-[#1E2A42] p-6 text-center text-[#8892A8] text-sm">
        {lang === 'ru'
          ? 'Уроки этого модуля скоро появятся. Загляни через пару дней.'
          : 'Lessons for this module are launching soon. Check back in a few days.'}
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {lessons.map((lesson) => {
        const isDone = completed.has(lesson.slug);
        return (
          <li key={lesson.slug}>
            <a
              href={`/${lang}/course/${moduleSlug}/${lesson.slug}`}
              className={`group flex items-center gap-4 p-4 sm:p-5 bg-[#131829] border transition ${
                isDone
                  ? 'border-[#39FF6B]/60 hover:border-[#39FF6B] hover:bg-[#39FF6B]/5'
                  : 'border-[#1E2A42] hover:border-[#00F0FF] hover:bg-[#00F0FF]/5'
              }`}
            >
              <span
                className={`shrink-0 w-9 h-9 flex items-center justify-center border font-['JetBrains_Mono'] text-xs font-bold ${
                  isDone
                    ? 'border-[#39FF6B] text-[#39FF6B] bg-[#39FF6B]/10'
                    : 'border-[#1E2A42] text-[#8892A8]'
                }`}
                aria-hidden="true"
              >
                {isDone ? '✓' : lesson.order.toString().padStart(2, '0')}
              </span>

              <div className="flex-1 min-w-0">
                <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568]">
                  {t(STRINGS.module, lang)} · {lang === 'ru' ? 'УРОК' : 'LESSON'} {lesson.order.toString().padStart(2, '0')}
                  {lesson.widget_type && (
                    <span className="ml-2 text-[#00F0FF]">
                      · {lesson.widget_type.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm sm:text-base text-[#E4E8F1] group-hover:text-[#00F0FF] transition truncate">
                  {lesson.title}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[2px] text-[#8892A8]">
                  {lesson.est_minutes} {t(STRINGS.estMinutes, lang)}
                </div>
                {isDone && (
                  <div className="mt-0.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#39FF6B]">
                    {t(STRINGS.completed, lang)}
                  </div>
                )}
              </div>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
