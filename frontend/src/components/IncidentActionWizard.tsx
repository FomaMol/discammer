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
 * The component deliberately accepts only the current language and a fixed
 * surface label. In particular, it has no pasted-input, hostname, finding, or
 * risk prop, performs no fetches or reporting, and keeps its checkbox state in
 * memory only for the current page.
 */
type IncidentActionSurface = 'message' | 'link';

interface IncidentActionWizardProps {
  lang?: Locale;
  /** Static UI context only, never analysis data or a user-provided value. */
  surface?: IncidentActionSurface;
}

export default function IncidentActionWizard({
  lang: langProp,
  surface = 'message',
}: IncidentActionWizardProps) {
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
      data-surface={surface}
      className="mt-8 border border-[var(--border-strong)] bg-[var(--panel)]/70 rounded-[4px]"
    >
      <details>
        <summary className="cursor-pointer px-4 sm:px-5 py-4 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--warning)] marker:text-[var(--warning)] focus-visible:outline-none focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:-3px]">
          {tr('disclosure')}
        </summary>

        <div className="border-t border-[var(--border)] px-4 sm:px-5 py-5">
          <h2 id={headingId} className="font-mono text-[14px] font-bold uppercase tracking-[0.08em] text-[var(--text)]">
            {tr('heading')}
          </h2>
          <p id={descriptionId} className="mt-2 max-w-[62ch] font-sans text-[14px] leading-[1.6] text-[var(--text-soft)]">
            {tr('intro')}
          </p>

          <fieldset className="mt-5" aria-describedby={descriptionId}>
            <legend className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
              {tr('legend')}
            </legend>
            <div className="mt-3 grid gap-2">
              {INCIDENT_IMPACTS.map((impact) => {
                const inputId = `${baseId}-${impact}`;
                return (
                  <label
                    key={impact}
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[3px] border border-[var(--border)] bg-[var(--canvas)]/50 px-3 py-3 font-sans text-[14px] leading-[1.45] text-[var(--text-medium)] transition-colors hover:border-[var(--brand-dim)] hover:bg-[var(--panel)]"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.includes(impact)}
                      onChange={() => toggleImpact(impact)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
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
              <h3 id={planId} className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--warning)]">
                {tr('actions_heading')}
              </h3>
              <ol className="mt-3 space-y-3">
                {actions.map((action, index) => (
                  <li key={action} className="flex gap-3 font-sans text-[14px] leading-[1.55] text-[var(--text-medium)]">
                    <span className="shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-[var(--warning)]" aria-hidden="true">
                      {index + 1}.
                    </span>
                    <span>{actionLabels[action]}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="mt-5 max-w-[62ch] font-sans text-[12px] leading-[1.5] text-[var(--muted)]">
            {tr('privacy')}
          </p>
          <p className="mt-4 rounded-[3px] border border-[var(--danger)]/40 bg-[var(--danger)]/[0.06] px-3 py-3 font-sans text-[13px] leading-[1.5] text-[var(--text-medium)]">
            {tr('immediate_danger')}
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="mt-4 min-h-11 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] underline decoration-[var(--brand-dim)] underline-offset-4 transition-colors hover:text-[var(--text)]"
          >
            {tr('reset')}
          </button>
        </div>
      </details>
    </section>
  );
}
