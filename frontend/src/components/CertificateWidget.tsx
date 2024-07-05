import { useEffect, useMemo, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
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

/** Compact ISO date for the operator code (YYYYMMDD). */
function compactDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '00000000';
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Extract operator initials from the recipient name. Falls back to "DCM" if
 * we can't derive two letters (rare — name input is required by the
 * pre-conditions of the unlocked state).
 */
function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'DCM';
  // Pull the leading character of every whitespace-separated token.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const letters = tokens
    .map((tok) => {
      // Skip non-letter characters at the start (numbers, brackets, etc).
      const match = tok.match(/[\p{L}]/u);
      return match ? match[0] : '';
    })
    .filter(Boolean)
    .join('')
    .toUpperCase();
  return letters.length >= 2 ? letters.slice(0, 3) : (letters + 'X').slice(0, 2);
}

/** 4-digit deterministic operator-code suffix derived from the name + exam. */
function operatorSuffix(name: string, exam: ExamRecord): string {
  // Reuse the same hash function so the suffix changes if name or pass change.
  const h = hashCode(`${name.trim()}|suffix|${exam.passedAt}|${exam.score}/${exam.total}`);
  // Pull four digits worth of entropy out of the alphanumeric hash.
  let digits = '';
  for (const ch of h) {
    digits += ((ch.charCodeAt(0) * 7 + 3) % 10).toString();
    if (digits.length >= 4) break;
  }
  return digits.padStart(4, '0').slice(0, 4);
}

export default function CertificateWidget({ config, locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('cert');
  const examKey = config.examKey || 'discammer:exam:v1';

  const [exam, setExam] = useState<ExamRecord | null>(null);
  const [completed, setCompleted] = useState<Record<string, Set<string>>>({});
  const [name, setName] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [editing, setEditing] = useState(false);

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
      const stored = window.localStorage.getItem(NAME_KEY) || '';
      setName(stored);
      setDraft(stored);
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

  // Commit the draft as the confirmed name and persist it so the certificate
  // survives reload. The certificate is only earned after this explicit
  // confirmation — keystrokes in the draft input must not unmount the form.
  function confirmName() {
    const value = draft.trim();
    if (!value) return;
    setName(value);
    setEditing(false);
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
  // A legacy per-keystroke-save bug could persist a 1-character (or empty)
  // operative name. Treat such names as unconfirmed (require ≥ 2 chars) so the
  // confirm step renders instead of auto-issuing a certificate with junk.
  const nameConfirmed = name.trim().length >= 2;
  const earned = allModulesDone && examPassed && !editing && nameConfirmed;

  const verificationCode = useMemo(() => {
    if (!earned || !exam) return '';
    return hashCode(`${name.trim()}|${exam.passedAt}|${exam.score}/${exam.total}`);
  }, [earned, exam, name]);

  const operatorCode = useMemo(() => {
    if (!earned || !exam) return '';
    const ini = initialsOf(name);
    const date = compactDate(exam.passedAt);
    const suffix = operatorSuffix(name, exam);
    return `DCM-${ini}-${date}-${suffix}`;
  }, [earned, exam, name]);

  return (
    <div className="space-y-6">
      <PrerequisitesPanel
        moduleStatus={moduleStatus}
        examPassed={examPassed}
        exam={exam}
      />

      {!earned ? (
        <div className="bg-[#121828] border border-[#202a44] p-5 sm:p-6 rounded-[4px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f4b965] mb-3">
            {tr('locked_heading')}
          </div>
          <p className="font-sans text-[15px] text-[#cdd4e3] leading-relaxed max-w-[62ch]">
            {tr('locked_body')}
          </p>

          {allModulesDone && examPassed && (
            <div className="mt-4">
              <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] mb-2">
                {tr('name_label')}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmName();
                  }}
                  placeholder={tr('name_placeholder')}
                  className="flex-1 min-w-[220px] max-w-md bg-[#1e2740] border border-[#202a44] focus:border-[#65def0] outline-none px-3 py-2 text-[#e7ecf5] font-sans text-[15px] rounded-[3px]"
                />
                <button
                  type="button"
                  onClick={confirmName}
                  disabled={!draft.trim()}
                  className="px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0]/5 border border-[#65def0] text-[#65def0] hover:bg-[#65def0]/10 transition rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tr('name_confirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Certificate
          name={name}
          dateLabel={formatDate(exam!.passedAt, lang)}
          verificationCode={verificationCode}
          operatorCode={operatorCode}
          score={exam!.score}
          total={exam!.total}
          onRename={() => {
            setDraft(name);
            setEditing(true);
          }}
        />
      )}
    </div>
  );
}

function PrerequisitesPanel({
  moduleStatus,
  examPassed,
  exam,
}: {
  moduleStatus: { module: string; total: number; complete: number; done: boolean }[];
  examPassed: boolean;
  exam: ExamRecord | null;
}) {
  const tr = makeTranslator('cert');
  return (
    <div className="bg-[#121828] border border-[#202a44] p-5 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#65def0] mb-3">
        {tr('prereq_heading')}
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
            {tr('prereq_exam')}
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
 * Frame style: 2px cyan border + corner brackets (└ ┐ ┘ ┌ in mono, one in
 * each corner). Top mono header `// CLEARANCE GRANTED`, operator code line
 * below the recipient name, and an issuing-officer signature footer.
 */
function Certificate({
  name,
  dateLabel,
  verificationCode,
  operatorCode,
  score,
  total,
  onRename,
}: {
  name: string;
  dateLabel: string;
  verificationCode: string;
  operatorCode: string;
  score: number;
  total: number;
  onRename: () => void;
}) {
  const tr = makeTranslator('cert');
  const heading = tr('heading');
  const title = tr('title');
  const programme = tr('programme');
  const presented = tr('presented_to');
  const description = tr('description');
  const dateLabelText = tr('date_label');
  const scoreLabel = tr('score_label');
  const verificationLabel = tr('verification_label');
  const operatorLabel = tr('operator_code_label');
  const issuingOfficerLabel = tr('issuing_officer_label');
  const issuingOfficer = tr('issuing_officer_signature');
  const printLabel = tr('print_label');
  const renameLabel = tr('rename_label');

  return (
    <div className="space-y-4">
      <div
        id="discammer-certificate"
        className="relative bg-[#0b0f1a] border-2 border-[#65def0] p-8 sm:p-12 overflow-hidden shadow-[0_0_0_1px_var(--color-cyan-dim),0_0_60px_-12px_var(--color-cyan-veil)]"
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
          {/* Top header strip */}
          <div className="text-center">
            <div className="inline-block px-3 py-1 border border-[#65def0]/40 bg-[#65def0]/10 font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.32em] text-[#65def0]">
              {heading}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <span className="font-display-wordmark text-[#65def0] text-[13px] sm:text-[15px] glow-cyan">
              DISCAMMER
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aab2c4] tabular-nums">
              {dateLabelText}: {dateLabel}
            </span>
          </div>

          <div className="mt-8 text-center">
            <div className="font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.4em] text-[#65def0]">
              {title}
            </div>
            <div className="mt-1 font-mono text-[14px] sm:text-[16px] uppercase tracking-[0.18em] text-[#7ce896]">
              {programme}
            </div>

            <div className="mt-10 font-sans text-[#aab2c4] text-[15px]">{presented}</div>
            <div className="mt-3 font-mono font-bold text-[#f3f5fa] leading-[1.15] tracking-[-0.02em] text-[clamp(1.75rem,1.3rem+1.8vw,2.5rem)] break-words">
              {name}
            </div>

            {/* Operator code — directly below name, mono tabular-nums */}
            <div className="mt-3 font-mono text-[12px] sm:text-[13px] uppercase tracking-[0.22em] text-[#f4b965] tabular-nums">
              {operatorLabel}: {operatorCode}
            </div>

            <p className="mt-8 max-w-[62ch] mx-auto font-sans text-[#cdd4e3] text-[15px] sm:text-[16px] leading-[1.6]">
              {description}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b94a8]">
                {scoreLabel}
              </div>
              <div className="font-mono text-[#7ce896] text-[18px] mt-1 tabular-nums">
                {score}/{total}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b94a8]">
                {verificationLabel}
              </div>
              <div className="font-mono text-[#65def0] text-[18px] mt-1 tabular-nums">DSC-{verificationCode}</div>
            </div>
          </div>

          {/* Issuing officer signature footer */}
          <div className="mt-12 pt-6 border-t border-[#202a44] flex items-end justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <div className="border-b border-[#65def0]/40 pb-1 mb-1.5">
                <span className="font-mono italic text-[#65def0] text-[15px] sm:text-[16px] tracking-[0.05em]">
                  /s/ {issuingOfficer}
                </span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b94a8]">
                {issuingOfficerLabel}
              </div>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b94a8] text-right">
              {tr('authority_block')}
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
