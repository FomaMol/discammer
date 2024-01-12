import { useEffect, useState } from 'react';
import {
  isLessonComplete,
  markLessonComplete,
  markLessonIncomplete,
  subscribe,
} from '../utils/progress';
import { Locale, STRINGS, normalizeLocale, t } from '../utils/i18n';

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

  return (
    <div className="space-y-6">
      {/* Mark complete row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs sm:text-sm tracking-[2px] border transition ${
            done
              ? 'border-[#39FF6B] text-[#39FF6B] bg-[#39FF6B]/10'
              : 'border-[#00F0FF] text-[#00F0FF] bg-[#00F0FF]/5 hover:bg-[#00F0FF]/10'
          }`}
        >
          {done ? `✓ ${t(STRINGS.completed, lang)}` : t(STRINGS.markComplete, lang)}
        </button>
        <a
          href={moduleHref}
          className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8] hover:text-[#00F0FF] transition"
        >
          {lang === 'ru' ? '↑ К списку уроков' : '↑ Back to lessons'}
        </a>
      </div>

      {/* Prev / Next */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {prevHref ? (
          <a
            href={prevHref}
            className="group flex flex-col gap-1 p-4 border border-[#1E2A42] hover:border-[#00F0FF]/60 transition"
          >
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568]">
              &larr; {t(STRINGS.prev, lang)}
            </span>
            <span className="text-sm text-[#E4E8F1] group-hover:text-[#00F0FF] transition">
              {prevTitle}
            </span>
          </a>
        ) : (
          <span />
        )}
        {nextHref ? (
          <a
            href={nextHref}
            className="group flex flex-col gap-1 p-4 border border-[#00F0FF] bg-[#00F0FF]/5 hover:bg-[#00F0FF]/10 transition text-right"
          >
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#00F0FF]">
              {t(STRINGS.next, lang)} &rarr;
            </span>
            <span className="text-sm text-[#E4E8F1] group-hover:text-[#00F0FF] transition">
              {nextTitle}
            </span>
          </a>
        ) : (
          <a
            href={moduleHref}
            className="group flex flex-col gap-1 p-4 border border-[#39FF6B] bg-[#39FF6B]/5 hover:bg-[#39FF6B]/10 transition text-right"
          >
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#39FF6B]">
              {t(STRINGS.finishModule, lang)} &rarr;
            </span>
            <span className="text-sm text-[#E4E8F1] group-hover:text-[#39FF6B] transition">
              {lang === 'ru' ? 'Вернуться к модулю' : 'Return to module'}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
