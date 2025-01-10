import { useId, useState } from 'react';
import {
  INCIDENT_IMPACTS,
  actionIdsForImpacts,
  type IncidentActionId,
  type IncidentImpact,
} from '../data/incident_actions';
import { currentLang, makeTranslator, type Locale } from '../utils/i18n';

/**
 * Local, inline incident-action guide for a person who may already have acted.
 *
 * The component deliberately accepts only the current language. In particular,
 * it has no message-text or analysis-result prop, performs no fetches or
 * reporting, and keeps its checkbox state in memory only for the current page.
 */
interface IncidentActionWizardProps {
  lang?: Locale;
}

export default function IncidentActionWizard({ lang: langProp }: IncidentActionWizardProps) {
  const lang = currentLang(langProp);
  const tr = makeTranslator('incident');
  const [selected, setSelected] = useState<readonly IncidentImpact[]>([]);
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const descriptionId = `${baseId}-description`;
  const planId = `${baseId}-plan`;
  const actions = actionIdsForImpacts(selected);
  // Keep translation keys literal here so the repository i18n audit can prove
  // every action branch is authored in both locales.
  const impactLabels: Record<IncidentImpact, string> = {
    money: tr('impact_money'),
    credentials: tr('impact_credentials'),
    device: tr('impact_device'),
    identity: tr('impact_identity'),
    received_only: tr('impact_received_only'),
  };
  const actionLabels: Record<IncidentActionId, string> = {
    stop: tr('action_stop'),
    trusted_channel: tr('action_trusted_channel'),
    money: tr('action_money'),
    credentials: tr('action_credentials'),
    device: tr('action_device'),
    identity: tr('action_identity'),
    tell_trusted: tr('action_tell_trusted'),
  };

  const toggleImpact = (impact: IncidentImpact) => {
    setSelected((current) =>
      current.includes(impact)
        ? current.filter((selectedImpact) => selectedImpact !== impact)
        : [...current, impact],
    );
  };

  const clearSelection = () => setSelected([]);

  return (
    <section
      data-incident-action-wizard
      data-lang={lang}
      className="mt-8 border border-[#2b3759] bg-[#121828]/70 rounded-[4px]"
    >
      <details>
        <summary className="cursor-pointer px-4 sm:px-5 py-4 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[#f4b965] marker:text-[#f4b965] focus-visible:outline-none focus-visible:[outline:2px_solid_#65def0] focus-visible:[outline-offset:-3px]">
          {tr('disclosure')}
        </summary>

        <div className="border-t border-[#202a44] px-4 sm:px-5 py-5">
          <h2 id={headingId} className="font-mono text-[14px] font-bold uppercase tracking-[0.08em] text-[#e7ecf5]">
            {tr('heading')}
          </h2>
          <p id={descriptionId} className="mt-2 max-w-[62ch] font-sans text-[14px] leading-[1.6] text-[#aab2c4]">
            {tr('intro')}
          </p>

          <fieldset className="mt-5" aria-describedby={descriptionId}>
            <legend className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#65def0]">
              {tr('legend')}
            </legend>
            <div className="mt-3 grid gap-2">
              {INCIDENT_IMPACTS.map((impact) => {
                const inputId = `${baseId}-${impact}`;
                return (
                  <label
                    key={impact}
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[3px] border border-[#202a44] bg-[#0b0f1a]/50 px-3 py-3 font-sans text-[14px] leading-[1.45] text-[#cdd4e3] transition-colors hover:border-[#3a8b9a] hover:bg-[#121828]"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.includes(impact)}
                      onChange={() => toggleImpact(impact)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#65def0]"
                    />
                    <span>{impactLabels[impact]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {actions.length > 0 && (
            <section className="mt-6" aria-labelledby={planId}>
              <p role="status" aria-atomic="true" className="sr-only">
                {tr('plan_status', { count: actions.length })}
              </p>
              <h3 id={planId} className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f4b965]">
                {tr('actions_heading')}
              </h3>
              <ol className="mt-3 space-y-3">
                {actions.map((action, index) => (
                  <li key={action} className="flex gap-3 font-sans text-[14px] leading-[1.55] text-[#cdd4e3]">
                    <span className="shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-[#f4b965]" aria-hidden="true">
                      {index + 1}.
                    </span>
                    <span>{actionLabels[action]}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="mt-5 max-w-[62ch] font-sans text-[12px] leading-[1.5] text-[#8b94a8]">
            {tr('privacy')}
          </p>
          <p className="mt-4 rounded-[3px] border border-[#e76670]/40 bg-[#e76670]/[0.06] px-3 py-3 font-sans text-[13px] leading-[1.5] text-[#cdd4e3]">
            {tr('immediate_danger')}
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="mt-4 min-h-11 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#aab2c4] underline decoration-[#3a8b9a] underline-offset-4 transition-colors hover:text-[#e7ecf5]"
          >
            {tr('reset')}
          </button>
        </div>
      </details>
    </section>
  );
}
