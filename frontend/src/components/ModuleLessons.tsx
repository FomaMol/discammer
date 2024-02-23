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

  // TODO: i18n key for module.checklist.loading
  const loadingLabel = pick(lang, { en: '> Loading mission briefings...', ru: '> Загрузка брифингов...' });
  // TODO: i18n key for module.checklist.error
  const errorLabel = pick(lang, { en: 'Failed to load lessons.', ru: 'Не удалось загрузить уроки.' });
  // TODO: i18n key for module.checklist.empty
  const emptyLabel = pick(lang, {
    en: 'Briefings for this mission are launching soon. Check back in a few days.',
    ru: 'Брифинги этой миссии скоро появятся. Загляни через пару дней.',
  });
  // TODO: i18n key for module.checklist.header
  const checklistHeader = pick(lang, { en: '// MISSION CHECKLIST', ru: '// ЧЕК-ЛИСТ МИССИИ' });
  // TODO: i18n key for module.checklist.openLabel
  const openLabel = pick(lang, { en: 'OPEN BRIEFING', ru: 'ОТКРЫТЬ' });

  if (loading) {
    return (
      <div className="text-center py-6 font-mono text-[13px] text-[#6b7588]">
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
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] tabular-nums">
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
                    isDone ? 'text-[#7ce896]' : 'text-[#6b7588] group-hover:text-[#65def0]'
                  } transition-colors`}
                  aria-hidden="true"
                >
                  {isDone ? '[✓]' : '[ ]'}
                </span>

                {/* Order number — small mono ID-like */}
                <span
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums w-7 ${
                    isDone ? 'text-[#6b7588]' : 'text-[#6b7588] group-hover:text-[#65def0]'
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
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588]">
                      {/* TODO: i18n key for module.checklist.widget_<type> */}
                      {lesson.widget_type === 'quiz' && pick(lang, { en: '▸ ASSESSMENT', ru: '▸ ОЦЕНКА' })}
                      {lesson.widget_type === 'scenario' && pick(lang, { en: '▸ FIELD SIMULATION', ru: '▸ ПОЛЕВАЯ СИМУЛЯЦИЯ' })}
                      {lesson.widget_type === 'redflags' && pick(lang, { en: '▸ THREAT INDICATORS', ru: '▸ ИНДИКАТОРЫ УГРОЗЫ' })}
                      {lesson.widget_type === 'exam' && pick(lang, { en: '▸ FINAL EXAMINATION', ru: '▸ ФИНАЛЬНЫЙ ЭКЗАМЕН' })}
                      {lesson.widget_type === 'certificate' && pick(lang, { en: '▸ CLEARANCE', ru: '▸ ДОПУСК' })}
                    </div>
                  )}
                </div>

                {/* Right side: time + completion */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
                    {lesson.est_minutes} {t(STRINGS.estMinutes, lang)}
                  </div>
                  <div
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums ${
                      isDone
                        ? 'text-[#7ce896]'
                        : 'text-[#3a8b9a] opacity-0 group-hover:opacity-100 transition-opacity'
                    }`}
                  >
                    {isDone ? t(STRINGS.completed, lang) : openLabel}
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
