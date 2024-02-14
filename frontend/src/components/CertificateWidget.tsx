import { useEffect, useMemo, useState } from 'react';
import { Locale, normalizeLocale, pick } from '../utils/i18n';
import { getCompletedLessons, subscribe } from '../utils/progress';

export interface CertificateConfig {
  /** Modules required for the certificate, with the lesson slugs that count. */
  requirements: { module: string; lessons: string[] }[];
  /** Exam pass key in localStorage (default: discammer:exam:v1). */
  examKey?: string;
}

interface Props {
  config: CertificateConfig;
  locale: Locale;
}

interface ExamRecord {
  passed: boolean;
  score: number;
  total: number;
  passedAt: string;
}

const NAME_KEY = 'discammer:certificate:name';

function readExam(key: string): ExamRecord | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ExamRecord;
  } catch {
    return null;
  }
}

function hashCode(str: string): string {
  // Stable short hash for the verification code. Not cryptographic — purely
  // a visual flourish so each certificate looks distinct.
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).toUpperCase().padStart(6, '0').slice(0, 8);
}

function formatDate(iso: string, lang: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function CertificateWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const examKey = config.examKey || 'discammer:exam:v1';

  const [exam, setExam] = useState<ExamRecord | null>(null);
  const [completed, setCompleted] = useState<Record<string, Set<string>>>({});
  const [name, setName] = useState<string>('');

  // Hydrate from localStorage on mount and subscribe to progress + exam changes.
  useEffect(() => {
    const sync = () => {
      setExam(readExam(examKey));
      const next: Record<string, Set<string>> = {};
      config.requirements.forEach((req) => {
        next[req.module] = new Set(getCompletedLessons(req.module));
      });
      setCompleted(next);
    };
    sync();
    try {
      setName(window.localStorage.getItem(NAME_KEY) || '');
    } catch {
      /* noop */
    }
    const off1 = subscribe(sync);
    const onExam = () => sync();
    window.addEventListener('discammer:exam', onExam);
    return () => {
      off1();
      window.removeEventListener('discammer:exam', onExam);
    };
  }, [config.requirements, examKey]);

  // Persist name so the certificate survives reload.
  function updateName(value: string) {
    setName(value);
    try {
      window.localStorage.setItem(NAME_KEY, value);
    } catch {
      /* noop */
    }
  }

  const moduleStatus = useMemo(() => {
    return config.requirements.map((req) => {
      const done = completed[req.module] || new Set();
      const missing = req.lessons.filter((l) => !done.has(l));
      return {
        module: req.module,
        total: req.lessons.length,
        complete: req.lessons.length - missing.length,
        missing,
        done: missing.length === 0,
      };
    });
  }, [config.requirements, completed]);

  const allModulesDone = moduleStatus.every((m) => m.done);
  const examPassed = !!exam?.passed;
  const earned = allModulesDone && examPassed && name.trim().length > 0;

  const code = useMemo(() => {
    if (!earned || !exam) return '';
    return hashCode(`${name.trim()}|${exam.passedAt}|${exam.score}/${exam.total}`);
  }, [earned, exam, name]);

  return (
    <div className="space-y-6">
      <PrerequisitesPanel
        moduleStatus={moduleStatus}
        examPassed={examPassed}
        exam={exam}
        lang={lang}
      />

      {!earned ? (
        <div className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f4b965] mb-3">
            {pick(lang, { en: '// CERTIFICATE LOCKED', ru: '// СЕРТИФИКАТ НЕ ОТКРЫТ' })}
          </div>
          <p className="font-sans text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
            {pick(lang, {
              en: 'Complete every lesson in every module and pass the final exam (at least 80%) to unlock your DiScammer Defender certificate.',
              ru: 'Закрой все уроки во всех модулях и сдай финальный экзамен (не ниже 80%), чтобы открыть сертификат DiScammer Defender.',
            })}
          </p>

          {allModulesDone && examPassed && !name.trim() && (
            <div className="mt-4">
              <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] mb-2">
                {pick(lang, {
                  en: 'Enter the name to print on the certificate',
                  ru: 'Имя, которое будет на сертификате',
                })}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => updateName(e.target.value)}
                placeholder={pick(lang, { en: 'Full name', ru: 'Полное имя' })}
                className="w-full max-w-md bg-[#1e2740] border border-[#202a44] focus:border-[#65def0] outline-none px-3 py-2 text-[#e7ecf5] font-sans text-[15px] rounded-[3px]"
              />
            </div>
          )}
        </div>
      ) : (
        <Certificate
          name={name}
          dateLabel={formatDate(exam!.passedAt, lang)}
          code={code}
          score={exam!.score}
          total={exam!.total}
          lang={lang}
          onRename={() => updateName('')}
        />
      )}
    </div>
  );
}

function PrerequisitesPanel({
  moduleStatus,
  examPassed,
  exam,
  lang,
}: {
  moduleStatus: { module: string; total: number; complete: number; done: boolean }[];
  examPassed: boolean;
  exam: ExamRecord | null;
  lang: Locale;
}) {
  return (
    <div className="bg-[#121828] border border-[#202a44] p-5 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#65def0] mb-3">
        {pick(lang, { en: '// PREREQUISITES', ru: '// УСЛОВИЯ ДОСТУПА' })}
      </div>
      <ul className="space-y-2">
        {moduleStatus.map((m) => (
          <li key={m.module} className="flex items-center gap-3 font-sans text-[14px]">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 border font-mono text-[10px] shrink-0 ${
                m.done
                  ? 'border-[#7ce896] text-[#7ce896] bg-[#7ce896]/10'
                  : 'border-[#202a44] text-[#aab2c4]'
              }`}
            >
              {m.done ? '✓' : '·'}
            </span>
            <span className="flex-1 text-[#cdd4e3]">{m.module}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
              {m.complete}/{m.total}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 font-sans text-[14px] pt-2 border-t border-[#202a44]">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 border font-mono text-[10px] shrink-0 ${
              examPassed
                ? 'border-[#7ce896] text-[#7ce896] bg-[#7ce896]/10'
                : 'border-[#202a44] text-[#aab2c4]'
            }`}
          >
            {examPassed ? '✓' : '·'}
          </span>
          <span className="flex-1 text-[#cdd4e3]">
            {pick(lang, { en: 'Final exam (at least 80%)', ru: 'Финальный экзамен (от 80%)' })}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
            {exam ? `${exam.score}/${exam.total}` : '—'}
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * The actual certificate frame.
 *
 * Frame style: 2px cyan border + corner brackets (└ ┐ ┘ ┌ in mono, one in each
 * corner) + subtle inset grid pattern. No 4-corner-border-flourish (too
 * AI-decorative).
 */
function Certificate({
  name,
  dateLabel,
  code,
  score,
  total,
  lang,
  onRename,
}: {
  name: string;
  dateLabel: string;
  code: string;
  score: number;
  total: number;
  lang: Locale;
  onRename: () => void;
}) {
  const heading = pick(lang, {
    en: 'CERTIFICATE OF COMPLETION',
    ru: 'СЕРТИФИКАТ ОБ ОКОНЧАНИИ',
  });
  const subheading = pick(lang, {
    en: 'DiScammer Defender Programme',
    ru: 'Программа DiScammer Defender',
  });
  const presented = pick(lang, {
    en: 'is hereby presented to',
    ru: 'выдан',
  });
  const description = pick(lang, {
    en: 'for completing all nine modules and passing the capstone exam of the DiScammer cyber-safety curriculum.',
    ru: 'за прохождение всех девяти модулей и сдачу итогового экзамена курса DiScammer по цифровой безопасности.',
  });
  const dateLabelText = pick(lang, { en: 'Issued on', ru: 'Дата выдачи' });
  const scoreLabel = pick(lang, { en: 'Final score', ru: 'Финальный результат' });
  const codeLabel = pick(lang, { en: 'Verification code', ru: 'Код проверки' });
  const printLabel = pick(lang, { en: 'Print or save as PDF', ru: 'Печать / сохранить PDF' });
  const renameLabel = pick(lang, { en: 'Change name', ru: 'Изменить имя' });

  return (
    <div className="space-y-4">
      <div
        id="discammer-certificate"
        className="relative bg-[#0b0f1a] border-2 border-[#65def0] p-8 sm:p-12 overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(rgba(101,222,240,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(101,222,240,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      >
        {/* Corner brackets — mono characters anchored in each corner */}
        <span
          aria-hidden="true"
          className="absolute top-2 left-2 font-mono text-[#65def0] text-[18px] leading-none select-none"
        >
          ┌
        </span>
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 font-mono text-[#65def0] text-[18px] leading-none select-none"
        >
          ┐
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 font-mono text-[#65def0] text-[18px] leading-none select-none"
        >
          └
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-2 right-2 font-mono text-[#65def0] text-[18px] leading-none select-none"
        >
          ┘
        </span>

        <div className="relative">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="font-display-wordmark text-[#65def0] text-[13px] sm:text-[15px] glow-cyan">
              DISCAMMER
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
              {dateLabelText}: {dateLabel}
            </span>
          </div>

          <div className="mt-10 text-center">
            <div className="font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.4em] text-[#65def0]">
              {heading}
            </div>
            <div className="mt-1 font-mono text-[14px] sm:text-[16px] uppercase tracking-[0.18em] text-[#7ce896]">
              {subheading}
            </div>

            <div className="mt-10 font-sans text-[#aab2c4] text-[15px]">{presented}</div>
            <div className="mt-3 font-mono font-bold text-[#f3f5fa] leading-[1.15] tracking-[-0.02em] text-[clamp(1.75rem,1.3rem+1.8vw,2.5rem)] break-words">
              {name}
            </div>

            <p className="mt-8 max-w-[62ch] mx-auto font-sans text-[#cdd4e3] text-[15px] sm:text-[16px] leading-[1.6]">
              {description}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588]">
                {scoreLabel}
              </div>
              <div className="font-mono text-[#7ce896] text-[18px] mt-1 tabular-nums">
                {score}/{total}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588]">
                {codeLabel}
              </div>
              <div className="font-mono text-[#65def0] text-[18px] mt-1 tabular-nums">DSC-{code}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896]/5 border border-[#7ce896] text-[#7ce896] hover:bg-[#7ce896]/10 transition rounded-[4px]"
        >
          {printLabel}
        </button>
        <button
          type="button"
          onClick={onRename}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] hover:text-[#65def0] transition"
        >
          {renameLabel}
        </button>
      </div>
    </div>
  );
}
