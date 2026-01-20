import { useEffect, useState } from 'react';
import {
  isLessonComplete,
  isLessonRevisionComplete,
  markLessonComplete,
  markLessonIncomplete,
  markLessonRevisionComplete,
  markLessonRevisionIncomplete,
  subscribe,
} from '../utils/progress';
import { Locale, makeTranslator } from '../utils/i18n';
import { trackEvent } from '../utils/analytics';

interface Props {
  moduleSlug: string;
  lessonSlug: string;
  locale: Locale;
  prevHref: string | null;
  prevTitle: string | null;
  nextHref: string | null;
  nextTitle: string | null;
  moduleHref: string;
  contentRevision?: string | null;
}

export default function LessonFooter({
  moduleSlug,
  lessonSlug,
  locale,
  contentRevision,
  prevHref,
  prevTitle,
  nextHref,
  nextTitle,
  moduleHref,
}: Props) {
  const tr = makeTranslator('lessonFooter');
  const [legacyDone, setLegacyDone] = useState(false);
  const [revisionDone, setRevisionDone] = useState(false);

  // Hydrate from localStorage on mount and subscribe to cross-tab updates.
  useEffect(() => {
    const sync = () => {
      setLegacyDone(isLessonComplete(moduleSlug, lessonSlug));
      setRevisionDone(contentRevision ? isLessonRevisionComplete(moduleSlug, lessonSlug, contentRevision) : false);
    };
    sync();
    return subscribe(sync);
  }, [moduleSlug, lessonSlug, contentRevision]);

  const done = contentRevision ? revisionDone : legacyDone;

  function toggle() {
    if (contentRevision) {
      if (revisionDone) markLessonRevisionIncomplete(moduleSlug, lessonSlug, contentRevision);
      else {
        markLessonRevisionComplete(moduleSlug, lessonSlug, contentRevision);
        if (!legacyDone) markLessonComplete(moduleSlug, lessonSlug);
        trackEvent('lesson_complete');
      }
      return;
    }
    if (done) {
      markLessonIncomplete(moduleSlug, lessonSlug);
    } else {
      markLessonComplete(moduleSlug, lessonSlug);
      trackEvent('lesson_complete');
    }
  }

  const markCompleteLabel = contentRevision
    ? (locale === 'ru' ? 'Отметить обновлённый урок' : 'Mark updated lesson complete')
    : tr('mark_debrief_complete');
  const completedLabel = contentRevision
    ? (locale === 'ru' ? 'Обновлённый урок пройден' : 'Updated lesson complete')
    : tr('completed');
  const backToModule = tr('back_to_module');
  const prevLabel = tr('prev_briefing');
  const nextLabel = tr('next_briefing');
  const finishLabel = tr('finish_mission');
  const returnLabel = tr('return_to_mission');

  return (
    <div className="space-y-6">
      {/* Mark complete row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] border transition rounded-[4px] ${
            done
              ? 'border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10 hover:bg-[var(--success)]/15'
              : 'border-[var(--brand)] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] font-bold'
          }`}
        >
          {done ? completedLabel : markCompleteLabel}
        </button>
        <a
          href={moduleHref}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--brand)] transition"
        >
          {backToModule}
        </a>
      </div>
      {contentRevision && legacyDone && !revisionDone && <p className="text-[14px] leading-relaxed text-[var(--text-soft)]">
        {locale === 'ru'
          ? 'У вас сохранено завершение прежней версии урока. Обновлённая практика ещё не отмечена как пройденная.'
          : 'Your earlier lesson completion is preserved. The updated practice is not yet marked complete.'}
      </p>}

      {/* Prev / Next nav */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {prevHref ? (
          <a
            href={prevHref}
            className="group flex flex-col gap-1 p-4 border border-[var(--border)] bg-[var(--panel)]/60 hover:border-[var(--brand)] hover:bg-[var(--raised)] transition rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {prevLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[var(--text)] group-hover:text-[var(--brand)] transition break-words leading-relaxed">
              {prevTitle}
            </span>
          </a>
        ) : (
          <span />
        )}
        {nextHref ? (
          <a
            href={nextHref}
            className="group flex flex-col gap-1 p-4 border border-[var(--brand)] bg-[var(--brand)]/5 hover:bg-[var(--brand)]/10 transition text-right rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--brand)]">
              {nextLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[var(--text)] group-hover:text-[var(--brand)] transition break-words leading-relaxed">
              {nextTitle}
            </span>
          </a>
        ) : (
          <a
            href={moduleHref}
            className="group flex flex-col gap-1 p-4 border border-[var(--success)] bg-[var(--success)]/5 hover:bg-[var(--success)]/10 transition text-right rounded-[4px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--success)]">
              {finishLabel}
            </span>
            <span className="font-mono font-medium text-[14px] text-[var(--text)] group-hover:text-[var(--success)] transition break-words leading-relaxed">
              {returnLabel}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
