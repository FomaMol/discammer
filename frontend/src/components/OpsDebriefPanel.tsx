import { Locale, makeTranslator } from '../utils/i18n';

interface Props {
  locale?: Locale;
  /** Optional explicit takeaway. Falls back to a generic operator-line. */
  takeaway?: string;
  /** Optional next-action override. Falls back to a generic next step. */
  nextAction?: string;
  /** Lesson title — used to flavour the fallback takeaway. */
  lessonTitle?: string;
}

/**
 * Ops debrief panel — rendered after the lesson body, before the lesson
 * footer. Frames the lesson as an operator log entry; gives the reader a
 * concrete takeaway + a concrete next action.
 *
 * Hard-coded fallbacks are generic enough to read sensibly under any lesson;
 * authored lessons can override them by supplying `summary` / `next_action`
 * fields when those are added to the data model.
 */
export default function OpsDebriefPanel({ takeaway, nextAction, lessonTitle }: Props) {
  const tr = makeTranslator('opsDebrief');

  const heading = tr('heading');
  const takeawayLabel = tr('takeaway_label');
  const nextActionLabel = tr('next_action_label');

  const fallbackTakeaway = lessonTitle
    ? tr('fallback_takeaway_with_title', { title: lessonTitle.toLowerCase() })
    : tr('fallback_takeaway_generic');

  const fallbackNextAction = tr('fallback_next_action');

  const final = {
    takeaway: takeaway || fallbackTakeaway,
    nextAction: nextAction || fallbackNextAction,
  };

  return (
    <section
      className="bg-[#0b0f1a] border border-[#202a44] rounded-[4px] overflow-hidden mt-12"
      aria-label="Operator debrief"
    >
      <header className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#202a44] bg-[#121828]/60">
        <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
        <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
        <span className="block w-2 h-2 rounded-full border border-[#2b3759]" aria-hidden="true" />
        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-[#7ce896]">
          {heading}
        </span>
      </header>
      <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-3.5">
        <div className="flex items-start gap-3">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#7ce896] pt-0.5 shrink-0 w-[110px]"
            aria-hidden="true"
          >
            ▸ {takeawayLabel}
          </span>
          <p className="flex-1 font-sans text-[14px] sm:text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
            {final.takeaway}
          </p>
        </div>
        <div className="flex items-start gap-3 pt-3 border-t border-[#202a44]">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f4b965] pt-0.5 shrink-0 w-[110px]"
            aria-hidden="true"
          >
            ▸ {nextActionLabel}
          </span>
          <p className="flex-1 font-sans text-[14px] sm:text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
            {final.nextAction}
          </p>
        </div>
      </div>
    </section>
  );
}
