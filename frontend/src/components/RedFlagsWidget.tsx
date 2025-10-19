import { useMemo, useState } from 'react';
import { Locale, makeTranslator } from '../utils/i18n';

export interface RedFlagItem {
  id: string;
  /** Short label shown on the checkbox row. */
  label: string;
  /** True if this really is a red flag in the sample message. */
  flag: boolean;
  /** Per-item explanation revealed after submission. */
  explanation?: string;
}

export interface MessageBlock {
  /** Optional label rendered before the value (e.g. "From:"). */
  label?: string;
  value: string;
  /** Hint for monospaced rendering of envelope-style fields. */
  mono?: boolean;
}

export interface RedFlagsConfig {
  /** Display kind — purely styling. */
  source?: 'email' | 'sms' | 'web';
  setup?: string;
  /** Structured rendering of the message — preferable to a single blob. */
  messageBlocks?: MessageBlock[];
  /** Plain-text body of the message. Can be combined with messageBlocks. */
  body?: string;
  prompt?: string;
  items: RedFlagItem[];
}

interface Props {
  config: RedFlagsConfig;
  locale: Locale;
}

export default function RedFlagsWidget({ config }: Props) {
  const tr = makeTranslator('redflags');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const heading = tr('heading');
  const submitLabel = tr('submit');
  const resetLabel = tr('reset');
  const promptDefault = tr('prompt_default');
  const correctLabel = tr('correct');
  const missedLabel = tr('missed');
  const wrongLabel = tr('wrong');
  const scoreLabel = tr('score_heading');

  function toggle(id: string) {
    if (submitted) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSubmitted(false);
    setPicked(new Set());
  }

  const { totalFlags, correctHits, falsePositives, missed } = useMemo(() => {
    const actualFlags = config.items.filter((i) => i.flag);
    const hits = actualFlags.filter((i) => picked.has(i.id));
    const wrong = config.items.filter((i) => !i.flag && picked.has(i.id));
    const missing = actualFlags.filter((i) => !picked.has(i.id));
    return {
      totalFlags: actualFlags.length,
      correctHits: hits.length,
      falsePositives: wrong.length,
      missed: missing.length,
    };
  }, [config.items, picked]);

  return (
    <section className="bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--brand)] mb-3">
        {heading}
      </div>

      {config.setup && (
        <p className="font-sans text-[16px] text-[var(--text-medium)] leading-relaxed mb-4 max-w-[62ch]">
          {config.setup}
        </p>
      )}

      {/* Mock-up of the suspicious message. */}
      {(config.messageBlocks?.length || config.body) && (
        <div className="rounded-[3px] border border-[var(--border)] bg-[var(--code)] mb-5">
          {config.messageBlocks?.map((block, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2 border-b border-[var(--border)] last:border-b-0"
            >
              {block.label && (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] shrink-0 w-16 pt-0.5">
                  {block.label}
                </span>
              )}
              <span
                className={`text-[14px] text-[var(--text)] break-all ${
                  block.mono ? 'font-mono' : 'font-sans'
                }`}
              >
                {block.value}
              </span>
            </div>
          ))}
          {config.body && (
            <div className="px-4 py-3 font-sans text-[16px] text-[var(--text-medium)] leading-relaxed whitespace-pre-wrap">
              {config.body}
            </div>
          )}
        </div>
      )}

      <p className="font-sans text-[16px] text-[var(--text)] max-w-[62ch]">
        {config.prompt || promptDefault}
      </p>

      <ul className="mt-4 space-y-2">
        {config.items.map((item) => {
          const isPicked = picked.has(item.id);
          let stateClass = 'border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand)]/5';
          let badge: { text: string; cls: string } | null = null;
          if (submitted) {
            if (item.flag && isPicked) {
              stateClass = 'border-[var(--success)] bg-[var(--success)]/10';
              badge = { text: `✓ ${correctLabel}`, cls: 'text-[var(--success)]' };
            } else if (item.flag && !isPicked) {
              stateClass = 'border-[var(--warning)] bg-[var(--warning)]/10';
              badge = { text: `! ${missedLabel}`, cls: 'text-[var(--warning)]' };
            } else if (!item.flag && isPicked) {
              stateClass = 'border-[var(--danger)] bg-[var(--danger)]/10';
              badge = { text: `✗ ${wrongLabel}`, cls: 'text-[var(--danger)]' };
            }
          } else if (isPicked) {
            stateClass = 'border-[var(--brand)] bg-[var(--brand)]/8';
          }
          return (
            <li key={item.id}>
              <label
                className={`flex items-start gap-3 p-3.5 sm:p-4 border transition rounded-[3px] ${stateClass} ${
                  submitted ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  onChange={() => toggle(item.id)}
                  disabled={submitted}
                  className="mt-1 accent-[var(--brand)] shrink-0"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="font-sans text-[16px] text-[var(--text)] leading-snug">
                      {item.label}
                    </span>
                    {badge && (
                      <span
                        className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${badge.cls} pt-0.5`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </div>
                  {submitted && item.explanation && (
                    <p className="mt-2 font-sans text-[16px] text-[var(--text-soft)] leading-relaxed">
                      {item.explanation}
                    </p>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {submitted && (
        <div className="mt-5 p-4 border border-[var(--brand)]/40 bg-[var(--brand)]/5 rounded-[3px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--brand)] mb-2">
            {scoreLabel}
          </div>
          <p className="font-sans text-[16px] text-[var(--text)] leading-relaxed">
            <span className="font-mono text-[var(--success)] tabular-nums">{correctHits}</span>
            <span className="font-mono text-[var(--text-soft)]"> / {totalFlags}</span>{' '}
            {tr('score_caught')}
            {falsePositives > 0 && (
              <>
                {' · '}
                <span className="font-mono text-[var(--danger)] tabular-nums">{falsePositives}</span>{' '}
                {tr('score_false_positive')}
              </>
            )}
            {missed > 0 && (
              <>
                {' · '}
                <span className="font-mono text-[var(--warning)] tabular-nums">{missed}</span>{' '}
                {tr('score_missed')}
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={picked.size === 0}
            className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)] text-[var(--canvas)] hover:bg-[var(--brand-hover)] transition rounded-[4px] font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[var(--brand-dim)]"
          >
            {submitLabel} <span aria-hidden="true">▸</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="min-h-11 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-soft)] hover:text-[var(--brand)] transition"
          >
            ↺ {resetLabel}
          </button>
        )}
      </div>
    </section>
  );
}
