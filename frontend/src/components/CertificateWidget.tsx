import './CertificateWidget.css';
import { useEffect, useId, useMemo, useState } from 'react';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import { fetchCourseLessonManifest } from '../utils/api';
import { getCurrentCompletedLessons, getExamRevisionRecord, subscribe } from '../utils/progress';

export interface CertificateConfig {
  /** Modules required for the certificate, with the lesson slugs that count. */
  requirements: { module: string; lessons: string[] }[];
  /** Exam pass key in localStorage (default: discammer:exam:v1). */
  examKey?: string;
  /** Current exam revision; older exam records remain stored but do not unlock this record. */
  examRevision?: string;
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
  const tr = makeTranslator('cert');
  const examKey = config.examKey || 'discammer:exam:v1';
  const nameInputId = useId();
  const nameHintId = `${nameInputId}-hint`;

  const [exam, setExam] = useState<ExamRecord | null>(null);
  const [completed, setCompleted] = useState<Record<string, Set<string>>>({});
  const [manifest, setManifest] = useState<{ module_slug: string; slug: string; content_revision?: string | null }[] | null>(null);
  const [manifestError, setManifestError] = useState(false);
  const [name, setName] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCourseLessonManifest(lang).then((rows) => {
      if (!Array.isArray(rows)) throw new Error('Invalid course manifest');
      if (!cancelled) setManifest(rows);
    }).catch(() => { if (!cancelled) setManifestError(true); });
    return () => { cancelled = true; };
  }, [lang]);

  // Hydrate from localStorage on mount and subscribe to progress + exam changes.
  useEffect(() => {
    const sync = () => {
      setExam(config.examRevision ? getExamRevisionRecord(config.examRevision) : readExam(examKey));
      const next: Record<string, Set<string>> = {};
      config.requirements.forEach((req) => {
        next[req.module] = new Set(manifest ? getCurrentCompletedLessons(req.module,
          manifest.filter((lesson) => lesson.module_slug === req.module)) : []);
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
  }, [config.requirements, config.examRevision, examKey, manifest]);

  // Commit the draft as the confirmed name and persist it so the certificate
  // survives reload. The certificate is only earned after this explicit
  // confirmation — keystrokes in the draft input must not unmount the form.
  function confirmName() {
    const value = draft.trim();
    if (value.length < 2) return;
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

  return (
    <div className="space-y-6">
      {manifestError && <p role="status" className="text-[14px] text-[var(--warning)]">
        {lang === 'ru' ? 'Список текущих уроков недоступен. Обновите страницу, чтобы проверить локальный прогресс.' : 'The current lesson list is unavailable. Reload to check local progress.'}
      </p>}
      <PrerequisitesPanel
        moduleStatus={moduleStatus}
        examPassed={examPassed}
        exam={exam}
      />

      {!earned ? (
        <div className="bg-[var(--panel)] border border-[var(--border)] p-5 sm:p-6 rounded-[4px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--warning)] mb-3">
            {tr('locked_heading')}
          </div>
          <p className="font-sans text-[16px] text-[var(--text)] leading-relaxed max-w-[62ch]">
            {tr('locked_body')}
          </p>

          {allModulesDone && examPassed && (
            <div className="mt-4">
              <label
                htmlFor={nameInputId}
                className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] mb-2"
              >
                {tr('name_label')}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={nameInputId}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.trim().length >= 2) confirmName();
                  }}
                  placeholder={tr('name_placeholder')}
                  aria-describedby={nameHintId}
                  className="flex-1 min-w-[220px] max-w-md bg-[var(--input)] border border-[var(--border)] focus:border-[var(--brand)] outline-none px-3 py-2 text-[var(--text)] font-sans text-[16px] rounded-[3px]"
                />
                <button
                  type="button"
                  onClick={confirmName}
                  disabled={draft.trim().length < 2}
                  className="px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--brand)]/5 border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/10 transition rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tr('name_confirm')}
                </button>
              </div>
              <p id={nameHintId} className="mt-2 font-sans text-[13px] text-[var(--muted)]">
                {tr('name_hint')}
              </p>
            </div>
          )}
        </div>
      ) : (
        <Certificate
          name={name}
          dateLabel={formatDate(exam!.passedAt, lang)}
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
    <div className="bg-[var(--panel)] border border-[var(--border)] p-5 rounded-[4px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--brand)] mb-3">
        {tr('prereq_heading')}
      </div>
      <ul className="space-y-2">
        {moduleStatus.map((m) => (
          <li key={m.module} className="flex items-center gap-3 font-sans text-[14px]">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 border font-mono text-[10px] shrink-0 ${
                m.done
                  ? 'border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10'
                  : 'border-[var(--border)] text-[var(--muted)]'
              }`}
            >
              {m.done ? '✓' : '·'}
            </span>
            <span className="flex-1 text-[var(--text)]">{m.module}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
              {m.complete}/{m.total}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 font-sans text-[14px] pt-2 border-t border-[var(--border)]">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 border font-mono text-[10px] shrink-0 ${
              examPassed
                ? 'border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10'
                : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {examPassed ? '✓' : '·'}
          </span>
          <span className="flex-1 text-[var(--text)]">
            {tr('prereq_exam')}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
            {exam ? `${exam.score}/${exam.total}` : '—'}
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * The local completion-record frame.
 *
 * Frame style: 2px cyan border + corner brackets (└ ┐ ┘ ┌ in mono, one in
 * each corner). The record intentionally has no issuer, verification code, or
 * operator code: all progress lives only in this browser and is not verifiable
 * by DiScammer or a third party.
 */
function Certificate({
  name,
  dateLabel,
  score,
  total,
  onRename,
}: {
  name: string;
  dateLabel: string;
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
  const printLabel = tr('print_label');
  const renameLabel = tr('rename_label');

  return (
    <div className="space-y-4">
      <div
        id="discammer-certificate"
        className="relative bg-[var(--canvas)] border-2 border-[var(--brand)] p-8 sm:p-12 overflow-hidden shadow-[0_0_0_1px_var(--brand-dim),0_0_60px_-12px_color-mix(in srgb,var(--brand) 10%,transparent)]"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb,var(--brand) 4%,transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb,var(--brand) 4%,transparent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      >
        {/* Corner brackets — mono characters anchored in each corner */}
        <span
          aria-hidden="true"
          className="absolute top-2 left-2 font-mono text-[var(--brand)] text-[18px] leading-none select-none"
        >
          ┌
        </span>
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 font-mono text-[var(--brand)] text-[18px] leading-none select-none"
        >
          ┐
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 font-mono text-[var(--brand)] text-[18px] leading-none select-none"
        >
          └
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-2 right-2 font-mono text-[var(--brand)] text-[18px] leading-none select-none"
        >
          ┘
        </span>

        <div className="relative">
          {/* Top header strip */}
          <div className="text-center">
            <div className="inline-block px-3 py-1 border border-[var(--brand)]/40 bg-[var(--brand)]/10 font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.32em] text-[var(--brand)]">
              {heading}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
            <span className="font-display-wordmark text-[var(--brand)] text-[13px] sm:text-[16px] glow-cyan">
              DISCAMMER
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] tabular-nums">
              {dateLabelText}: {dateLabel}
            </span>
          </div>

          <div className="mt-8 text-center">
            <div className="font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.4em] text-[var(--brand)]">
              {title}
            </div>
            <div className="mt-1 font-mono text-[14px] sm:text-[16px] uppercase tracking-[0.18em] text-[var(--success)]">
              {programme}
            </div>

            <div className="mt-10 font-sans text-[var(--muted)] text-[16px]">{presented}</div>
            <div className="mt-3 font-mono font-bold text-[var(--text-strong)] leading-[1.15] tracking-[-0.02em] text-[clamp(1.75rem,1.3rem+1.8vw,2.5rem)] break-words">
              {name}
            </div>

            <p className="mt-8 max-w-[62ch] mx-auto font-sans text-[var(--text)] text-[16px] leading-[1.6]">
              {description}
            </p>
          </div>

          <div className="mt-10">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {scoreLabel}
              </div>
              <div className="font-mono text-[var(--success)] text-[18px] mt-1 tabular-nums">
                {score}/{total}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[var(--success)]/5 border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]/10 transition rounded-[4px]"
        >
          {printLabel}
        </button>
        <button
          type="button"
          onClick={onRename}
          className="min-h-11 font-mono text-[13px] uppercase tracking-[0.08em] text-[var(--muted)] hover:text-[var(--brand)] transition"
        >
          {renameLabel}
        </button>
      </div>
    </div>
  );
}
