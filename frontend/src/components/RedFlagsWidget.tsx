import { useMemo, useState } from 'react';
import { Locale, normalizeLocale, pick } from '../utils/i18n';

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

export default function RedFlagsWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const heading = pick(lang, { en: '// SPOT THE RED FLAGS', ru: '// НАЙДИ КРАСНЫЕ ФЛАГИ' });
  const submitLabel = pick(lang, { en: 'Submit selection', ru: 'Проверить' });
  const resetLabel = pick(lang, { en: 'Try again', ru: 'Заново' });
  const promptDefault = pick(lang, {
    en: 'Tick every item below that is a genuine red flag in this message.',
    ru: 'Отметь всё, что ниже, что является настоящим красным флагом в этом сообщении.',
  });
  const correctLabel = pick(lang, { en: 'CORRECT FLAG', ru: 'ВЕРНЫЙ ФЛАГ' });
  const missedLabel = pick(lang, { en: 'MISSED FLAG', ru: 'ПРОПУЩЕНО' });
  const wrongLabel = pick(lang, { en: 'NOT A FLAG', ru: 'НЕ ФЛАГ' });
  const scoreLabel = pick(lang, { en: 'Score', ru: 'Счёт' });

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
    <div className="bg-[#131829] border border-[#1E2A42] p-5 sm:p-6">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-3">
        {heading}
      </div>

      {config.setup && (
        <p className="text-sm text-[#C8D0E0] leading-relaxed mb-4">{config.setup}</p>
      )}

      {/* Mock-up of the suspicious message. */}
      {(config.messageBlocks?.length || config.body) && (
        <div className="rounded border border-[#1E2A42] bg-[#0B0E17] mb-5">
          {config.messageBlocks?.map((block, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-4 py-2 border-b border-[#1E2A42] last:border-b-0"
            >
              {block.label && (
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568] shrink-0 w-16">
                  {block.label}
                </span>
              )}
              <span
                className={`text-sm text-[#E4E8F1] break-all ${
                  block.mono ? "font-['JetBrains_Mono']" : ''
                }`}
              >
                {block.value}
              </span>
            </div>
          ))}
          {config.body && (
            <div className="px-4 py-3 text-sm text-[#C8D0E0] leading-relaxed whitespace-pre-wrap">
              {config.body}
            </div>
          )}
        </div>
      )}

      <p className="text-[#E4E8F1] text-sm sm:text-base">
        {config.prompt || promptDefault}
      </p>

      <ul className="mt-4 space-y-2">
        {config.items.map((item) => {
          const isPicked = picked.has(item.id);
          let stateClass = 'border-[#1E2A42] hover:border-[#00F0FF]/40';
          let badge: { text: string; cls: string } | null = null;
          if (submitted) {
            if (item.flag && isPicked) {
              stateClass = 'border-[#39FF6B] bg-[#39FF6B]/5';
              badge = { text: correctLabel, cls: 'text-[#39FF6B]' };
            } else if (item.flag && !isPicked) {
              stateClass = 'border-[#FFB547] bg-[#FFB547]/5';
              badge = { text: missedLabel, cls: 'text-[#FFB547]' };
            } else if (!item.flag && isPicked) {
              stateClass = 'border-[#FF4757] bg-[#FF4757]/5';
              badge = { text: wrongLabel, cls: 'text-[#FF4757]' };
            }
          } else if (isPicked) {
            stateClass = 'border-[#00F0FF] bg-[#00F0FF]/5';
          }
          return (
            <li key={item.id}>
              <label
                className={`flex items-start gap-3 p-3.5 border transition ${stateClass} ${
                  submitted ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  onChange={() => toggle(item.id)}
                  disabled={submitted}
                  className="mt-1 accent-[#00F0FF]"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-[#E4E8F1] leading-snug">{item.label}</span>
                    {badge && (
                      <span
                        className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </div>
                  {submitted && item.explanation && (
                    <p className="mt-2 text-xs text-[#8892A8] leading-relaxed">
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
        <div className="mt-5 p-4 border-l-2 border-[#00F0FF] bg-[#00F0FF]/5">
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-1">
            {scoreLabel}
          </div>
          <p className="text-sm text-[#E4E8F1]">
            <span className="text-[#39FF6B]">{correctHits}</span> / {totalFlags}{' '}
            {pick(lang, { en: 'flags caught', ru: 'флагов поймано' })}
            {falsePositives > 0 && (
              <>
                {' · '}
                <span className="text-[#FF4757]">{falsePositives}</span>{' '}
                {pick(lang, { en: 'false positives', ru: 'ложных срабатываний' })}
              </>
            )}
            {missed > 0 && (
              <>
                {' · '}
                <span className="text-[#FFB547]">{missed}</span>{' '}
                {pick(lang, { en: 'missed', ru: 'пропущено' })}
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
            className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8] hover:text-[#00F0FF] transition"
          >
            ↺ {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
