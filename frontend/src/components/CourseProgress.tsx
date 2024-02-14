import { useEffect, useMemo, useState } from 'react';
import { fetchCourseModules } from '../utils/api';
import { Locale, normalizeLocale, t } from '../utils/i18n';
import { getCompletedLessons, subscribe } from '../utils/progress';

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

const LABEL = {
  loading: { en: '> Loading training program', ru: '> Загрузка курса' },
  error: { en: '> ERROR: training modules unavailable.', ru: '> ОШИБКА: модули недоступны.' },
  modules: { en: 'Modules', ru: 'Модулей' },
  lessons: { en: 'Lessons', ru: 'Уроков' },
  totalTime: { en: 'Total time', ru: 'Всего времени' },
  progress: { en: 'Progress', ru: 'Прогресс' },
  module: { en: 'Module', ru: 'Модуль' },
  locked: { en: 'Locked', ru: 'Закрыт' },
  available: { en: 'In progress', ru: 'В работе' },
  ready: { en: 'Ready', ru: 'Открыт' },
  done: { en: 'Completed', ru: 'Пройден' },
  certificationTag: { en: '// CERTIFICATION', ru: '// СЕРТИФИКАТ' },
  certHeadline: {
    en: 'Earn the DiScammer Defender certificate.',
    ru: 'Получи сертификат DiScammer Defender.',
  },
  certBody: {
    en:
      'Finish all nine modules and pass the capstone simulation to receive a shareable certificate verifying that you can recognize, respond to, and recover from modern digital fraud.',
    ru:
      'Пройди все девять модулей и сдай итоговую симуляцию, чтобы получить публично-проверяемый сертификат — он подтверждает, что ты умеешь распознавать, реагировать и восстанавливаться после современного цифрового мошенничества.',
  },
  warmUp: { en: 'Warm up in the simulator', ru: 'Разогрейся в симуляторе' },
};

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
function applyProgressiveUnlock(modules: Module[], completedByModule: Map<string, number>): Module[] {
  let prevDone = true;
  return modules.map((m) => {
    const completed = completedByModule.get(m.slug) ?? 0;
    const requires = m.lessons ?? 0;
    const lockedBySeed = m.is_locked;
    const lockedByProgress = !prevDone;
    const open = !lockedBySeed || !lockedByProgress;
    // Carry forward whether *this* module is fully completed for the next iteration.
    prevDone = requires === 0 ? prevDone : completed >= requires;
    return { ...m, is_locked: !open };
  });
}

export default function CourseProgress({ locale }: Props) {
  const lang = normalizeLocale(locale);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchCourseModules(lang)
      .then((data) => {
        const list: ApiModule[] = Array.isArray(data) ? data : data?.modules ?? [];
        const normalized = list.map(normalize);
        setModules(normalized);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
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
    [modules, completed]
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
      <div className="py-12 text-center font-mono text-sm text-[#6b7588]">
        {t(LABEL.loading, lang)}
        <span className="cursor-blink" />
      </div>
    );
  }

  if (error || modules.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-sm text-[#e76670]">
        {t(LABEL.error, lang)}
      </div>
    );
  }

  return (
    <section className="space-y-12">
      <StatsBanner stats={stats} progressPercent={progressPercent} lang={lang} />
      <ModuleTimeline modules={liveModules} completed={completed} lang={lang} />
      <CertificationCallout lang={lang} />
    </section>
  );
}

function StatsBanner({
  stats,
  progressPercent,
  lang,
}: {
  stats: { moduleCount: number; totalLessons: number; completedLessons: number; duration: string };
  progressPercent: number;
  lang: Locale;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-[#202a44] bg-[#121828]/60 divide-y md:divide-y-0 md:divide-x divide-[#202a44]">
      <StatCell
        label={t(LABEL.modules, lang)}
        value={stats.moduleCount.toString().padStart(2, '0')}
        accent="text-[#65def0]"
      />
      <StatCell
        label={t(LABEL.lessons, lang)}
        value={`${stats.completedLessons}/${stats.totalLessons}`}
        accent="text-[#7ce896]"
      />
      <StatCell
        label={t(LABEL.totalTime, lang)}
        value={stats.duration}
        accent="text-[#f4b965]"
      />
      <StatCell
        label={t(LABEL.progress, lang)}
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
      <div className="mt-1 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[#6b7588]">
        {label}
      </div>
    </div>
  );
}

/**
 * Vertical timeline of modules. Each row: numbered badge (square, hairline,
 * mono tabular-nums) on the left, vertical 1px hairline connecting badges,
 * module title + 1-line description + status indicator to the right.
 */
function ModuleTimeline({
  modules,
  completed,
  lang,
}: {
  modules: Module[];
  completed: Map<string, number>;
  lang: Locale;
}) {
  return (
    <ol className="relative">
      {modules.map((mod, i) => (
        <TimelineRow
          key={mod.id}
          module={mod}
          completedLessons={completed.get(mod.slug) ?? 0}
          isLast={i === modules.length - 1}
          lang={lang}
        />
      ))}
    </ol>
  );
}

function TimelineRow({
  module,
  completedLessons,
  isLast,
  lang,
}: {
  module: Module;
  completedLessons: number;
  isLast: boolean;
  lang: Locale;
}) {
  const locked = module.is_locked;
  const total = module.lessons ?? 0;
  const moduleDone = total > 0 && completedLessons >= total;
  const inProgress = !locked && !moduleDone && completedLessons > 0;
  const order = module.order.toString().padStart(2, '0');

  // status indicator: ✓ done · ▶ in progress · ◯ ready · ● locked
  let statusIcon: string;
  let statusText: string;
  let statusColor: string;
  if (moduleDone) {
    statusIcon = '✓';
    statusText = t(LABEL.done, lang);
    statusColor = 'text-[#7ce896]';
  } else if (inProgress) {
    statusIcon = '▶';
    statusText = t(LABEL.available, lang);
    statusColor = 'text-[#f4b965]';
  } else if (locked) {
    statusIcon = '●';
    statusText = t(LABEL.locked, lang);
    statusColor = 'text-[#6b7588]';
  } else {
    statusIcon = '◯';
    statusText = t(LABEL.ready, lang);
    statusColor = 'text-[#65def0]';
  }

  // Badge color: completed → green, in progress → amber, ready → cyan, locked → muted
  let badgeBorder: string;
  let badgeText: string;
  let badgeBg: string;
  if (moduleDone) {
    badgeBorder = 'border-[#7ce896]';
    badgeText = 'text-[#7ce896]';
    badgeBg = 'bg-[#7ce896]/10';
  } else if (inProgress) {
    badgeBorder = 'border-[#f4b965]';
    badgeText = 'text-[#f4b965]';
    badgeBg = 'bg-[#f4b965]/10';
  } else if (locked) {
    badgeBorder = 'border-[#202a44]';
    badgeText = 'text-[#6b7588]';
    badgeBg = 'bg-[#0b0f1a]';
  } else {
    badgeBorder = 'border-[#65def0]';
    badgeText = 'text-[#65def0]';
    badgeBg = 'bg-[#0b0f1a]';
  }

  const RowInner = (
    <div className="flex items-start gap-4 sm:gap-5 w-full">
      {/* Numbered square badge */}
      <div
        className={`relative z-[1] shrink-0 w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center border ${badgeBorder} ${badgeBg} font-mono text-[12px] sm:text-[13px] font-bold tabular-nums ${badgeText}`}
        aria-hidden="true"
      >
        {order}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-1 pb-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3
            className={`font-mono font-bold text-[16px] sm:text-[17px] tracking-[-0.01em] leading-snug ${
              locked ? 'text-[#aab2c4]' : 'text-[#e7ecf5] group-hover:text-[#65def0]'
            } transition`}
          >
            {module.title}
          </h3>
          <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${statusColor}`}>
            <span aria-hidden="true">{statusIcon}</span> {statusText}
          </span>
          {!locked && total > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] tabular-nums">
              {completedLessons}/{total} {lang === 'ru' ? 'уроков' : 'lessons'}
            </span>
          )}
          {module.duration && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7588] tabular-nums">
              {module.duration}
            </span>
          )}
        </div>

        {module.description && (
          <p
            className={`mt-1.5 font-sans text-[14px] leading-relaxed ${
              locked ? 'text-[#6b7588]' : 'text-[#aab2c4]'
            }`}
          >
            {module.description}
          </p>
        )}
      </div>

      {/* Arrow chevron — only when actionable */}
      {!locked && (
        <div
          className="shrink-0 pt-2.5 font-mono text-[#65def0] text-[14px] group-hover:translate-x-0.5 transition-transform"
          aria-hidden="true"
        >
          &rarr;
        </div>
      )}
    </div>
  );

  return (
    <li className="relative">
      {/* Vertical hairline connector — from the badge bottom to the next badge top */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[19px] sm:left-[21px] top-10 sm:top-11 bottom-0 w-px bg-[#202a44]"
        />
      )}
      <div className="pb-6 sm:pb-7">
        {locked ? (
          <div className="opacity-60 cursor-not-allowed">{RowInner}</div>
        ) : (
          <a
            href={`/${lang}/course/${module.slug}`}
            className="group block focus-visible:outline-none focus-visible:[outline:2px_solid_#65def0] focus-visible:[outline-offset:2px]"
          >
            {RowInner}
          </a>
        )}
      </div>
    </li>
  );
}

function CertificationCallout({ lang }: { lang: Locale }) {
  return (
    <div className="relative overflow-hidden border border-[#202a44] bg-[#121828]/80 p-6 sm:p-8 grid-pattern rounded-[4px]">
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b7588] mb-2">
            {t(LABEL.certificationTag, lang)}
          </div>
          <h3 className="font-mono font-bold text-[#e7ecf5] text-[clamp(1.25rem,1rem+1vw,1.75rem)] leading-snug tracking-[-0.01em]">
            {t(LABEL.certHeadline, lang)}
          </h3>
          <p className="mt-3 font-sans text-[15px] sm:text-[16px] text-[#aab2c4] leading-relaxed max-w-2xl">
            {t(LABEL.certBody, lang)}
          </p>
        </div>
        <div className="flex justify-start md:justify-end">
          <a
            href={`/${lang}/game`}
            className="inline-flex items-center gap-2 px-5 py-3 font-mono uppercase text-[11px] tracking-[0.14em] bg-[#7ce896]/5 border border-[#7ce896] text-[#7ce896] hover:bg-[#7ce896]/10 transition rounded-[4px]"
          >
            <span aria-hidden="true">▸</span> {t(LABEL.warmUp, lang)}
          </a>
        </div>
      </div>
    </div>
  );
}
