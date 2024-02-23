import { useEffect, useState } from 'react';
import {
  isLessonComplete,
  markLessonComplete,
  markLessonIncomplete,
  subscribe,
} from '../utils/progress';
import { Locale, normalizeLocale, pick } from '../utils/i18n';

interface Props {
  moduleSlug: string;
  lessonSlug: string;
  locale: Locale;
  prevHref: string | null;
  prevTitle: string | null;
  nextHref: string | null;
  nextTitle: string | null;
  moduleHref: string;
}

export default function LessonFooter({
  moduleSlug,
  lessonSlug,
  locale,
  prevHref,
  prevTitle,
  nextHref,
  nextTitle,
  moduleHref,
}: Props) {
  const lang = normalizeLocale(locale);
  const [done, setDone] = useState(false);

  // Hydrate from localStorage on mount and subscribe to cross-tab updates.
  useEffect(() => {
    const sync = () => setDone(isLessonComplete(moduleSlug, lessonSlug));
    sync();
    return subscribe(sync);
  }, [moduleSlug, lessonSlug]);

  function toggle() {
    if (done) {
      markLessonIncomplete(moduleSlug, lessonSlug);
    } else {
      markLessonComplete(moduleSlug, lessonSlug);
    }
  }

  // TODO: i18n key for lesson.footer.mark_debrief_complete
  const markCompleteLabel = pick(lang, {
    en: '▸ MARK DEBRIEF COMPLETE',
    ru: '▸ ОТМЕТИТЬ ДЕБРИФ',
  });
  // TODO: i18n key for lesson.footer.completed
  const completedLabel = pick(lang, { en: '✓ DEBRIEF LOGGED', ru: '✓ ДЕБРИФ ЗАПИСАН' });
  // TODO: i18n key for lesson.footer.back_to_module
  const backToModule = pick(lang, { en: '↑ Mission checklist', ru: '↑ Чек-лист миссии' });
  // TODO: i18n key for lesson.footer.prev_briefing
  const prevLabel = pick(lang, { en: '◁ PREV BRIEFING', ru: '◁ ПРЕД. БРИФИНГ' });
  // TODO: i18n key for lesson.footer.next_briefing
  const nextLabel = pick(lang, { en: 'NEXT BRIEFING ▷', ru: 'СЛЕД. БРИФИНГ ▷' });
  // TODO: i18n key for lesson.footer.finish_mission
  const finishLabel = pick(lang, { en: 'COMPLETE MISSION ▷', ru: 'ЗАВЕРШИТЬ МИССИЮ ▷' });
  // TODO: i18n key for lesson.footer.return_to_mission
  const returnLabel = pick(lang, { en: 'Return to mission', ru: 'Вернуться к миссии' });

  return (
    <div className="space-y-6">
      {/* Mark complete row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] border transition rounded-[4px] ${
            done
              ? 'border-[#7ce896] text-[#7ce896] bg-[#7ce896]/10 hover:bg-[#7ce896]/15'
              : 'border-[#65def0] bg-[#65def0] text-[#0b0f1a] hover:bg-[#9eecf6] font-bold'
          }`}
        >
          {done ? completedLabel : markCompleteLabel}
        </button>
        <a
          href={moduleHref}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0] transition"
        >
          {backToModule}
        </a>
      </div>

      {/* Prev / Next nav */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {prevHref ? (
          <a
            href={prevHref}
            className="group flex flex-col gap-1 p-4 border border-[#202a44] bg-[#121828]/60 hover:border-[#65def0] hover:bg-[#1a2236] transition rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588]">
              {prevLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[#e7ecf5] group-hover:text-[#65def0] transition truncate">
              {prevTitle}
            </span>
          </a>
        ) : (
          <span />
        )}
        {nextHref ? (
          <a
            href={nextHref}
            className="group flex flex-col gap-1 p-4 border border-[#65def0] bg-[#65def0]/5 hover:bg-[#65def0]/10 transition text-right rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#65def0]">
              {nextLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[#e7ecf5] group-hover:text-[#65def0] transition truncate">
              {nextTitle}
            </span>
          </a>
        ) : (
          <a
            href={moduleHref}
            className="group flex flex-col gap-1 p-4 border border-[#7ce896] bg-[#7ce896]/5 hover:bg-[#7ce896]/10 transition text-right rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7ce896]">
              {finishLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[#e7ecf5] group-hover:text-[#7ce896] transition truncate">
              {returnLabel}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
