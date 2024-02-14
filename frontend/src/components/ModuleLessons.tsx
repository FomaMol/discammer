import { useEffect, useState } from 'react';
import { Locale, STRINGS, normalizeLocale, pick, t } from '../utils/i18n';
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
      <div className="text-center py-6 font-mono text-[13px] text-[#6b7588]">
        {pick(lang, { en: '> Loading lessons...', ru: '> Загрузка уроков...' })}
        <span className="cursor-blink" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[#121828] border border-[#e76670]/40 p-5 text-sm text-[#e76670] font-sans">
        {pick(lang, { en: 'Failed to load lessons.', ru: 'Не удалось загрузить уроки.' })}
      </div>
    );
  }
  if (lessons.length === 0) {
    return (
      <div className="bg-[#121828] border border-[#202a44] p-6 text-center text-[#aab2c4] font-sans text-[15px]">
        {pick(lang, {
          en: 'Lessons for this module are launching soon. Check back in a few days.',
          ru: 'Уроки этого модуля скоро появятся. Загляни через пару дней.',
        })}
      </div>
    );
  }

  return (
    <ol className="border border-[#202a44] bg-[#121828]/60 divide-y divide-[#202a44]">
      {lessons.map((lesson) => {
        const isDone = completed.has(lesson.slug);
        return (
          <li key={lesson.slug}>
            <a
              href={`/${lang}/course/${moduleSlug}/${lesson.slug}`}
              className={`group flex items-center gap-4 sm:gap-5 px-4 sm:px-5 py-4 transition ${
                isDone
                  ? 'hover:bg-[#7ce896]/5'
                  : 'hover:bg-[#1a2236]'
              }`}
            >
              {/* Number / done badge */}
              <span
                className={`shrink-0 w-8 sm:w-9 font-mono text-[12px] sm:text-[13px] font-bold tabular-nums text-center ${
                  isDone ? 'text-[#7ce896]' : 'text-[#6b7588] group-hover:text-[#65def0]'
                }`}
                aria-hidden="true"
              >
                {isDone ? '✓' : lesson.order.toString().padStart(2, '0')}
              </span>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div
                  className={`font-mono font-medium text-[14px] sm:text-[15px] tracking-[-0.005em] truncate ${
                    isDone
                      ? 'text-[#aab2c4] group-hover:text-[#7ce896]'
                      : 'text-[#e7ecf5] group-hover:text-[#65def0]'
                  } transition`}
                >
                  {lesson.title}
                </div>
                {lesson.widget_type && (
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588]">
                    {lesson.widget_type === 'quiz' && pick(lang, { en: 'KNOWLEDGE CHECK', ru: 'ПРОВЕРКА' })}
                    {lesson.widget_type === 'scenario' && pick(lang, { en: 'SCENARIO', ru: 'СЦЕНАРИЙ' })}
                    {lesson.widget_type === 'redflags' && pick(lang, { en: 'RED FLAGS', ru: 'КРАСНЫЕ ФЛАГИ' })}
                    {lesson.widget_type === 'exam' && pick(lang, { en: 'EXAM', ru: 'ЭКЗАМЕН' })}
                    {lesson.widget_type === 'certificate' && pick(lang, { en: 'CERTIFICATE', ru: 'СЕРТИФИКАТ' })}
                  </div>
                )}
              </div>

              {/* Right side: time + completion */}
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
                  {lesson.est_minutes} {t(STRINGS.estMinutes, lang)}
                </div>
                {isDone && (
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7ce896]">
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
