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
        <div className="bg-[#131829] border border-[#1E2A42] p-5 sm:p-6">
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#FFB547] mb-3">
            {pick(lang, { en: '// CERTIFICATE LOCKED', ru: '// СЕРТИФИКАТ НЕ ОТКРЫТ' })}
          </div>
          <p className="text-sm text-[#C8D0E0] leading-relaxed">
            {pick(lang, {
              en: 'Complete every lesson in every module and pass the final exam (≥80%) to unlock your DiScammer Defender certificate.',
              ru: 'Закрой все уроки во всех модулях и сдай финальный экзамен (≥80%), чтобы открыть сертификат DiScammer Defender.',
            })}
          </p>

          {allModulesDone && examPassed && !name.trim() && (
            <div className="mt-4">
              <label className="block font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8] mb-2">
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
                className="w-full max-w-md bg-[#0B0E17] border border-[#1E2A42] focus:border-[#00F0FF] outline-none px-3 py-2 text-[#E4E8F1] text-sm"
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
    <div className="bg-[#131829] border border-[#1E2A42] p-5">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#00F0FF] mb-3">
        {pick(lang, { en: '// PREREQUISITES', ru: '// УСЛОВИЯ ДОСТУПА' })}
      </div>
      <ul className="space-y-2">
        {moduleStatus.map((m) => (
          <li key={m.module} className="flex items-center gap-3 text-sm">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 border font-['JetBrains_Mono'] text-[10px] shrink-0 ${
                m.done
                  ? 'border-[#39FF6B] text-[#39FF6B] bg-[#39FF6B]/10'
                  : 'border-[#1E2A42] text-[#8892A8]'
              }`}
            >
              {m.done ? '✓' : '·'}
            </span>
            <span className="flex-1 text-[#C8D0E0]">{m.module}</span>
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8]">
              {m.complete}/{m.total}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 text-sm pt-2 border-t border-[#1E2A42]">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 border font-['JetBrains_Mono'] text-[10px] shrink-0 ${
              examPassed
                ? 'border-[#39FF6B] text-[#39FF6B] bg-[#39FF6B]/10'
                : 'border-[#1E2A42] text-[#8892A8]'
            }`}
          >
            {examPassed ? '✓' : '·'}
          </span>
          <span className="flex-1 text-[#C8D0E0]">
            {pick(lang, { en: 'Final exam (≥80%)', ru: 'Финальный экзамен (≥80%)' })}
          </span>
          <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8]">
            {exam ? `${exam.score}/${exam.total}` : '—'}
          </span>
        </li>
      </ul>
    </div>
  );
}

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
  const printLabel = pick(lang, { en: 'Print / save as PDF', ru: 'Печать / сохранить PDF' });
  const renameLabel = pick(lang, { en: 'Change name', ru: 'Изменить имя' });

  return (
    <div className="space-y-4">
      <div
        id="discammer-certificate"
        className="relative bg-[#0B0E17] border-2 border-[#00F0FF] p-8 sm:p-12 overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,240,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <div className="relative">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="font-['Press_Start_2P'] text-[#00F0FF] text-xs sm:text-sm glow-cyan">
              DISCAMMER
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#8892A8]">
              {dateLabelText}: {dateLabel}
            </span>
          </div>

          <div className="mt-8 text-center">
            <div className="font-['JetBrains_Mono'] text-[11px] sm:text-xs uppercase tracking-[6px] text-[#00F0FF]">
              {heading}
            </div>
            <div className="font-['JetBrains_Mono'] text-base sm:text-lg uppercase tracking-[3px] text-[#39FF6B] mt-1">
              {subheading}
            </div>

            <div className="mt-10 text-[#8892A8] text-sm">{presented}</div>
            <div className="mt-2 font-['JetBrains_Mono'] text-2xl sm:text-4xl text-[#E4E8F1] font-bold break-words">
              {name}
            </div>

            <p className="mt-8 max-w-2xl mx-auto text-[#C8D0E0] text-sm sm:text-base leading-relaxed">
              {description}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8]">
            <div>
              <div className="text-[#4A5568]">{scoreLabel}</div>
              <div className="text-[#39FF6B] text-base mt-1">
                {score} / {total}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[#4A5568]">{codeLabel}</div>
              <div className="text-[#00F0FF] text-base mt-1">DSC-{code}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#39FF6B]/5 border border-[#39FF6B] text-[#39FF6B] hover:bg-[#39FF6B]/10 hover:shadow-[0_0_25px_rgba(57,255,107,0.25)] transition"
        >
          {printLabel}
        </button>
        <button
          type="button"
          onClick={onRename}
          className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8] hover:text-[#00F0FF] transition"
        >
          {renameLabel}
        </button>
      </div>
    </div>
  );
}
