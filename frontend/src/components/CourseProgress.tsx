import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCourseModules } from '../utils/api';
import { Locale, makeTranslator, normalizeLocale } from '../utils/i18n';
import {
  exportProgress,
  getCompletedLessons,
  importProgress,
  subscribe,
} from '../utils/progress';

type Accent = 'cyan' | 'green' | 'amber' | 'red';

interface Module {
  id: string;
  slug: string;
  order: number;
  title: string;
  description?: string;
  is_locked: boolean;
  icon?: string;
  duration?: string;
  lessons?: number;
  difficulty?: string;
  topics?: string[];
  objectives?: string[];
  accent?: Accent;
}

interface ApiModule {
  id?: number;
  slug?: string;
  order?: number;
  number?: number;
  title?: string;
  description?: string;
  status?: string;
  is_locked?: boolean;
  icon?: string;
  duration?: string;
  lessons?: number;
  difficulty?: string;
  topics?: string[];
  objectives?: string[];
  accent?: string;
}

interface Props {
  locale?: Locale;
}

function normalize(api: ApiModule, idx: number): Module {
  const order = api.order ?? api.number ?? idx + 1;
  const accentRaw = (api.accent || 'cyan').toLowerCase();
  const accent: Accent = (['cyan', 'green', 'amber', 'red'] as Accent[]).includes(accentRaw as Accent)
    ? (accentRaw as Accent)
    : 'cyan';
  return {
    id: String(api.id ?? order),
    slug: api.slug ?? String(order),
    order,
    title: api.title ?? `Module ${order}`,
    description: api.description,
    is_locked: api.is_locked ?? api.status === 'locked',
    icon: api.icon,
    duration: api.duration,
    lessons: api.lessons,
    difficulty: api.difficulty,
    topics: api.topics ?? [],
    objectives: api.objectives ?? [],
    accent,
  };
}

/**
 * Given the seed-time lock state plus the user's completed-lesson state,
 * decide which modules are open right now. Rule: a module is open if
 * is_locked is false OR every prior module's lessons are completed.
 */
function applyProgressiveUnlock(
  modules: Module[],
  completedByModule: Map<string, number>,
): Module[] {
  let prevDone = true;
  const out: Module[] = [];
  for (const m of modules) {
    const completed = completedByModule.get(m.slug) ?? 0;
    const requires = m.lessons ?? 0;
    const lockedBySeed = m.is_locked;
    // Match the stated rule directly: unlocked when the seed says so OR
    // when every prior module's lessons are completed.
    const open = !lockedBySeed || prevDone;
    out.push({ ...m, is_locked: !open });
    prevDone = prevDone && (requires === 0 || completed >= requires);
  }
  return out;
}

export default function CourseProgress({ locale }: Props) {
  const lang = normalizeLocale(locale);
  const tr = makeTranslator('courseProgress');
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchCourseModules(lang)
      .then((data) => {
        const list: ApiModule[] = Array.isArray(data) ? data : data?.modules ?? [];
        const normalized = list.map(normalize);
        if (!cancelled) setModules(normalized);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Re-derive completion counts from localStorage on mount + on every change.
  useEffect(() => {
    const sync = () => {
      const map = new Map<string, number>();
      modules.forEach((m) => map.set(m.slug, getCompletedLessons(m.slug).length));
      setCompleted(map);
    };
    sync();
    return subscribe(sync);
  }, [modules]);

  const liveModules = useMemo(
    () => applyProgressiveUnlock(modules, completed),
    [modules, completed],
  );

  const stats = useMemo(() => {
    const totalLessons = modules.reduce((sum, m) => sum + (m.lessons ?? 0), 0);
    const completedLessons = Array.from(completed.values()).reduce((a, b) => a + b, 0);
    const totalMinutes = modules.reduce((sum, m) => {
      const match = m.duration?.match(/(\d+)/);
      return sum + (match ? parseInt(match[1], 10) : 0);
    }, 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return {
      moduleCount: modules.length,
      totalLessons,
      completedLessons,
      duration: hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`,
    };
  }, [modules, completed]);

  const progressPercent =
    stats.totalLessons > 0
      ? Math.round((stats.completedLessons / stats.totalLessons) * 100)
      : 0;

  if (loading) {
    return (
      <div className="py-12 text-center font-mono text-sm text-[#868fa3]">
        {tr('loading')}
        <span className="cursor-blink" />
      </div>
    );
  }

  if (error || modules.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-sm text-[#e76670]">
        {tr('error')}
      </div>
    );
  }

  return (
    <section className="space-y-10 sm:space-y-12" id="modules">
      <StatsBanner stats={stats} progressPercent={progressPercent} />
      <MissionFlow modules={liveModules} completed={completed} lang={lang} />
      <CertificationCallout lang={lang} />
      <DossierFooter />
    </section>
  );
}

/** YYYYMMDD for the download filename, computed from the local date. */
function dossierDateStamp(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

type ToastState = { kind: 'ok' | 'err'; text: string } | null;

/**
 * Export / import footer — the "operative dossier" handoff. EXPORT downloads a
 * versioned JSON snapshot of progress + exam + cert name; IMPORT merges a file
 * back in (best-of, non-destructive) and reports what changed. No destructive
 * confirm dialog because the merge only ever adds.
 */
function DossierFooter() {
  // Distinct variable name (not `tr`) so the i18n audit binds this island's
  // `progress` namespace correctly — the file's other translators use `tr`.
  const trp = makeTranslator('progress');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // Auto-dismiss the toast after a few seconds (cleared on unmount / re-toast).
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  function handleExport() {
    try {
      const dossier = exportProgress();
      const blob = new Blob([JSON.stringify(dossier, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discammer-progress-${dossierDateStamp(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setToast({ kind: 'err', text: trp('toast_export_error') });
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires `change` again.
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importProgress(String(reader.result ?? ''));
      if (result.ok) {
        const extra =
          result.improvedExams > 0 ? ` ${trp('toast_import_exam', { n: result.improvedExams })}` : '';
        setToast({
          kind: 'ok',
          text: `${trp('toast_import_ok', { n: result.addedLessons })}${extra}`,
        });
      } else {
        setToast({ kind: 'err', text: trp('toast_import_error') });
      }
    };
    reader.onerror = () => setToast({ kind: 'err', text: trp('toast_import_error') });
    reader.readAsText(file);
  }

  return (
    <div className="border-t border-[#202a44] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#868fa3]">
            {trp('dossier_tag')}
          </div>
          <p className="mt-1.5 font-sans text-[13px] text-[#868fa3] leading-relaxed max-w-[52ch]">
            {trp('dossier_hint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#65def0]/5 border border-[#65def0] text-[#65def0] hover:bg-[#65def0]/10 transition rounded-[4px] focus-visible:outline-none focus-visible:[outline:2px_solid_#65def0] focus-visible:[outline-offset:2px]"
          >
            <span aria-hidden="true">▸</span> {trp('export_action')}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 font-mono uppercase text-[11px] tracking-[0.14em] text-[#aab2c4] border border-[#202a44] hover:border-[#3a8b9a] hover:text-[#65def0] transition rounded-[4px] focus-visible:outline-none focus-visible:[outline:2px_solid_#65def0] focus-visible:[outline-offset:2px]"
          >
            <span aria-hidden="true">▴</span> {trp('import_action')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        {toast && (
          <div
            className={`mt-4 flex items-start justify-between gap-3 px-3.5 py-2.5 border rounded-[3px] font-mono text-[12px] leading-relaxed ${
              toast.kind === 'ok'
                ? 'border-[#7ce896]/40 bg-[#7ce896]/8 text-[#7ce896]'
                : 'border-[#e76670]/40 bg-[#e76670]/8 text-[#e76670]'
            }`}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label={trp('toast_dismiss')}
              className="shrink-0 text-current/70 hover:text-current transition"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsBanner({
  stats,
  progressPercent,
}: {
  stats: { moduleCount: number; totalLessons: number; completedLessons: number; duration: string };
  progressPercent: number;
}) {
  const tr = makeTranslator('courseProgress');
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-[#202a44] bg-[#121828]/60 divide-y md:divide-y-0 md:divide-x divide-[#202a44]">
      <StatCell
        label={tr('stats_modules')}
        value={stats.moduleCount.toString().padStart(2, '0')}
        accent="text-[#65def0]"
      />
      <StatCell
        label={tr('stats_lessons')}
        value={`${stats.completedLessons}/${stats.totalLessons}`}
        accent="text-[#7ce896]"
      />
      <StatCell
        label={tr('stats_runtime')}
        value={stats.duration}
        accent="text-[#f4b965]"
      />
      <StatCell
        label={tr('stats_progress')}
        value={`${progressPercent}%`}
        accent="text-[#e7ecf5]"
      />
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-4 py-5 sm:py-6">
      <div className={`font-mono text-xl sm:text-2xl font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[#868fa3]">
        {label}
      </div>
    </div>
  );
}

/**
 * Mission Flow — vertical sequence of mission cards. Each row pairs a square
 * number badge (with a vertical hairline connector visible between rows on
 * desktop) and a wide mission card with title + status panel.
 */
function MissionFlow({
  modules,
  completed,
  lang,
}: {
  modules: Module[];
  completed: Map<string, number>;
  lang: Locale;
}) {
  const tr = makeTranslator('courseProgress');
  return (
    <div className="relative">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#868fa3] mb-4">
        {tr('flow_tag')}
        <span className="ml-2 text-[#3a8b9a]" aria-hidden="true">
          ━━━━━━━━━━
        </span>
      </div>
      <ol className="relative space-y-3 sm:space-y-4">
        {/* Decorative vertical mission line — desktop only, behind the badge column */}
        <span
          aria-hidden="true"
          className="hidden md:block absolute top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-[#202a44] to-transparent left-[27px]"
        />
        {modules.map((mod, i) => (
          <MissionCard
            key={mod.id}
            module={mod}
            previousModule={i > 0 ? modules[i - 1] : null}
            completedLessons={completed.get(mod.slug) ?? 0}
            lang={lang}
          />
        ))}
      </ol>
    </div>
  );
}

interface MissionCardProps {
  module: Module;
  previousModule: Module | null;
  completedLessons: number;
  lang: Locale;
}

function MissionCard({ module, previousModule, completedLessons, lang }: MissionCardProps) {
  const tr = makeTranslator('courseProgress');
  const locked = module.is_locked;
  const total = module.lessons ?? 0;
  const moduleDone = total > 0 && completedLessons >= total;
  const inProgress = !locked && !moduleDone && completedLessons > 0;
  const order = module.order.toString().padStart(2, '0');
  const lessonsShort = tr('lessons_short');

  let badgeBorder: string;
  let badgeBg: string;
  let badgeText: string;
  let badgePulse = '';
  if (moduleDone) {
    badgeBorder = 'border-[#7ce896]';
    badgeText = 'text-[#7ce896]';
    badgeBg = 'bg-[#7ce896]/10';
  } else if (inProgress) {
    badgeBorder = 'border-[#65def0]';
    badgeText = 'text-[#65def0]';
    badgeBg = 'bg-[#65def0]/10';
    badgePulse = 'dcm-badge-pulse';
  } else if (locked) {
    badgeBorder = 'border-[#202a44]';
    badgeText = 'text-[#868fa3]';
    badgeBg = 'bg-[#0b0f1a]';
  } else {
    badgeBorder = 'border-[#3a8b9a]';
    badgeText = 'text-[#65def0]';
    badgeBg = 'bg-[#0b0f1a]';
  }

  // Status badge content
  let statusText: string;
  let statusColor: string;
  if (moduleDone) {
    statusText = tr('status_completed');
    statusColor = 'text-[#868fa3] line-through decoration-[#6b7588]/40';
  } else if (inProgress) {
    statusText = tr('status_in_progress');
    statusColor = 'text-[#65def0]';
  } else if (locked) {
    statusText = tr('status_locked');
    statusColor = 'text-[#e76670]';
  } else {
    statusText = tr('status_ready');
    statusColor = 'text-[#7ce896]';
  }

  const progressRatio = total > 0 ? Math.min(1, Math.max(0, completedLessons / total)) : 0;

  const cardBase =
    'dcm-mission-card relative w-full border bg-[#121828] rounded-[4px] transition group';
  // Locked cards are de-emphasized via their muted per-element text colors (and
  // the red LOCKED status + non-interactivity), NOT a blanket opacity — a card
  // opacity dims the text below WCAG AA contrast. (a11y)
  const cardState = locked
    ? 'border-[#202a44]'
    : 'border-[#202a44] hover:border-[#3a8b9a] hover:bg-[#1a2236] hover:-translate-y-px';

  const RowContent = (
    <div className="flex flex-col sm:flex-row gap-0 sm:gap-0">
      {/* LEFT — title + description */}
      <div className="flex-1 p-4 sm:p-5 sm:pr-4 min-w-0 sm:basis-[60%]">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#868fa3]">
            {tr('mission_prefix')} {order}
          </span>
          {module.difficulty && (
            <span className="px-1.5 py-0.5 border border-[#202a44] font-mono text-[10px] uppercase tracking-[0.14em] text-[#aab2c4]">
              {module.difficulty}
            </span>
          )}
        </div>
        <h3
          className={`font-mono font-bold text-[15px] sm:text-[17px] uppercase tracking-[-0.01em] leading-snug ${
            locked
              ? 'text-[#aab2c4]'
              : 'text-[#e7ecf5] group-hover:text-[#65def0] transition-colors'
          }`}
        >
          {module.title}
        </h3>
        {module.description && (
          <p
            className={`mt-2 font-sans text-[14px] leading-relaxed line-clamp-2 ${
              locked ? 'text-[#868fa3]' : 'text-[#aab2c4]'
            }`}
          >
            {module.description}
          </p>
        )}
      </div>

      {/* RIGHT — status panel */}
      <div className="sm:basis-[40%] sm:max-w-[280px] flex flex-col gap-1.5 p-4 sm:p-5 sm:pl-4 sm:border-l border-t sm:border-t-0 border-[#202a44] bg-[#0b0f1a]/40">
        <div className={`font-mono text-[11px] uppercase tracking-[0.14em] ${statusColor}`}>
          {statusText}
        </div>
        {inProgress && total > 0 && (
          <div className="mt-1.5">
            <div className="h-[3px] bg-[#0b0f1a] border border-[#202a44] overflow-hidden rounded-[1px]">
              <div
                className="h-full bg-[#65def0] transition-[width] duration-300"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#868fa3] tabular-nums">
              {completedLessons}/{total} {lessonsShort}
            </div>
          </div>
        )}
        {moduleDone && (
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#868fa3] tabular-nums">
            {completedLessons}/{total} {lessonsShort} · {tr('completed_at')}
          </div>
        )}
        {locked && previousModule && (
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#e76670] tabular-nums">
            {tr('prereq')} {previousModule.order.toString().padStart(2, '0')}
          </div>
        )}
        {!locked && !moduleDone && !inProgress && (
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#868fa3] tabular-nums">
            {total} {lessonsShort}
            {module.duration ? ` · ${module.duration}` : ''}
          </div>
        )}
        {!locked && (
          <div className="mt-auto pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#3a8b9a] group-hover:text-[#65def0] transition-colors">
            {tr('open_briefing')}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <li className="relative flex items-stretch gap-3 sm:gap-4">
      {/* Number badge — square mono on the left */}
      <div
        className={`relative z-[1] shrink-0 w-12 h-12 sm:w-[55px] sm:h-[55px] flex items-center justify-center border ${badgeBorder} ${badgeBg} ${badgeText} ${badgePulse} font-mono text-[16px] sm:text-[20px] font-extrabold tabular-nums rounded-[3px] mt-1`}
        aria-hidden="true"
      >
        {order}
      </div>

      <div className="flex-1 min-w-0">
        {locked ? (
          <div className={`${cardBase} ${cardState} cursor-not-allowed`}>{RowContent}</div>
        ) : (
          <a
            href={`/${lang}/course/${module.slug}`}
            className={`${cardBase} ${cardState} block focus-visible:outline-none focus-visible:[outline:2px_solid_#65def0] focus-visible:[outline-offset:2px]`}
            aria-label={`${tr('mission_prefix')} ${order} — ${module.title} — ${statusText.replace(/^[^A-Za-zА-Яа-я]+/, '')}`}
          >
            {RowContent}
          </a>
        )}
      </div>

      {/* `.dcm-mission-card` + `.dcm-badge-pulse` styles + reduced-motion
          overrides live in globals.css. */}
    </li>
  );
}

function CertificationCallout({ lang }: { lang: Locale }) {
  const tr = makeTranslator('courseProgress');
  return (
    <div className="relative overflow-hidden border border-[#202a44] bg-[#121828]/80 p-6 sm:p-8 grid-pattern rounded-[4px]">
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#868fa3] mb-2">
            {tr('certification_tag')}
          </div>
          <h3 className="font-mono font-bold text-[#e7ecf5] text-[clamp(1.25rem,1rem+1vw,1.75rem)] leading-snug tracking-[-0.01em]">
            {tr('cert_headline')}
          </h3>
          <p className="mt-3 font-sans text-[15px] sm:text-[16px] text-[#aab2c4] leading-relaxed max-w-2xl">
            {tr('cert_body')}
          </p>
        </div>
        <div className="flex justify-start md:justify-end">
          <a
            href={`/${lang}/game`}
            className="inline-flex items-center gap-2 px-5 py-3 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896]/5 border border-[#7ce896] text-[#7ce896] hover:bg-[#7ce896]/10 transition rounded-[4px]"
          >
            <span aria-hidden="true">▸</span> {tr('warm_up')}
          </a>
        </div>
      </div>
    </div>
  );
}
