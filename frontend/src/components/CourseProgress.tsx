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

// IMPORTANT: every Tailwind class in this map must appear as a literal
// string somewhere Tailwind scans (here counts as that "somewhere").
const ACCENT_TOKENS: Record<Accent, {
  text: string;
  border: string;
  hoverBorder: string;
  bgSoft: string;
  glow: string;
  hoverGlow: string;
  dot: string;
}> = {
  cyan: {
    text: 'text-[#00F0FF]',
    border: 'border-[#00F0FF]',
    hoverBorder: 'hover:border-[#00F0FF]',
    bgSoft: 'bg-[#00F0FF]/10',
    glow: 'shadow-[0_0_25px_rgba(0,240,255,0.18)]',
    hoverGlow: 'hover:shadow-[0_0_25px_rgba(0,240,255,0.18)]',
    dot: 'bg-[#00F0FF]',
  },
  green: {
    text: 'text-[#39FF6B]',
    border: 'border-[#39FF6B]',
    hoverBorder: 'hover:border-[#39FF6B]',
    bgSoft: 'bg-[#39FF6B]/10',
    glow: 'shadow-[0_0_25px_rgba(57,255,107,0.18)]',
    hoverGlow: 'hover:shadow-[0_0_25px_rgba(57,255,107,0.18)]',
    dot: 'bg-[#39FF6B]',
  },
  amber: {
    text: 'text-[#FFB547]',
    border: 'border-[#FFB547]',
    hoverBorder: 'hover:border-[#FFB547]',
    bgSoft: 'bg-[#FFB547]/10',
    glow: 'shadow-[0_0_25px_rgba(255,181,71,0.18)]',
    hoverGlow: 'hover:shadow-[0_0_25px_rgba(255,181,71,0.18)]',
    dot: 'bg-[#FFB547]',
  },
  red: {
    text: 'text-[#FF4757]',
    border: 'border-[#FF4757]',
    hoverBorder: 'hover:border-[#FF4757]',
    bgSoft: 'bg-[#FF4757]/10',
    glow: 'shadow-[0_0_25px_rgba(255,71,87,0.18)]',
    hoverGlow: 'hover:shadow-[0_0_25px_rgba(255,71,87,0.18)]',
    dot: 'bg-[#FF4757]',
  },
};

const LABEL = {
  loading: { en: '> Loading training program', ru: '> Загрузка курса' },
  error: { en: '> ERROR: training modules unavailable.', ru: '> ОШИБКА: модули недоступны.' },
  modules: { en: 'Modules', ru: 'Модулей' },
  lessons: { en: 'Lessons', ru: 'Уроков' },
  totalTime: { en: 'Total time', ru: 'Всего времени' },
  progress: { en: 'Progress', ru: 'Прогресс' },
  learningPath: { en: 'Learning path', ru: 'Путь обучения' },
  unlocked: { en: 'unlocked', ru: 'разблокировано' },
  module: { en: 'Module', ru: 'Модуль' },
  locked: { en: 'Locked', ru: 'Закрыт' },
  available: { en: 'Available', ru: 'Открыт' },
  done: { en: 'Completed', ru: 'Пройден' },
  expand: { en: 'Expand', ru: 'Развернуть' },
  collapse: { en: 'Collapse', ru: 'Свернуть' },
  topicsCovered: { en: 'Topics covered', ru: 'Что разбираем' },
  byEndYouCan: { en: 'By the end you can', ru: 'Что сможешь после' },
  startModule: { en: 'Open module', ru: 'Открыть модуль' },
  continueModule: { en: 'Continue module', ru: 'Продолжить модуль' },
  unlocksAfter: { en: 'Unlocks after Module', ru: 'Откроется после модуля' },
  runtime: { en: 'runtime', ru: 'на модуль' },
  lessonsWord: { en: 'lessons', ru: 'уроков' },
  topicsWord: { en: 'topics', ru: 'тем' },
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchCourseModules(lang)
      .then((data) => {
        const list: ApiModule[] = Array.isArray(data) ? data : data?.modules ?? [];
        const normalized = list.map(normalize);
        setModules(normalized);
        const firstUnlocked = normalized.find((m) => !m.is_locked);
        if (firstUnlocked) setExpandedId(firstUnlocked.id);
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
      <div className="py-12 text-center font-['JetBrains_Mono'] text-sm text-[#4A5568]">
        {t(LABEL.loading, lang)}
        <span className="cursor-blink" />
      </div>
    );
  }

  if (error || modules.length === 0) {
    return (
      <div className="py-12 text-center font-['JetBrains_Mono'] text-sm text-[#FF4757]">
        {t(LABEL.error, lang)}
      </div>
    );
  }

  return (
    <section className="space-y-12">
      <StatsBanner stats={stats} progressPercent={progressPercent} lang={lang} />

      <ProgressBar modules={liveModules} progressPercent={progressPercent} lang={lang} />

      <ModuleList
        modules={liveModules}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        completed={completed}
        lang={lang}
      />

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
    <div className="grid grid-cols-2 md:grid-cols-4 border border-[#1E2A42] bg-[#0B0E17]/60 divide-y md:divide-y-0 md:divide-x divide-[#1E2A42]">
      <StatCell
        label={t(LABEL.modules, lang)}
        value={stats.moduleCount.toString().padStart(2, '0')}
        accent="text-[#00F0FF] glow-cyan"
      />
      <StatCell
        label={t(LABEL.lessons, lang)}
        value={`${stats.completedLessons}/${stats.totalLessons}`}
        accent="text-[#39FF6B]"
      />
      <StatCell
        label={t(LABEL.totalTime, lang)}
        value={stats.duration}
        accent="text-[#FFB547]"
      />
      <StatCell
        label={t(LABEL.progress, lang)}
        value={`${progressPercent}%`}
        accent="text-[#E4E8F1]"
      />
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-4 py-5 sm:py-6">
      <div className={`font-['JetBrains_Mono'] text-xl sm:text-2xl font-bold ${accent}`}>
        {value}
      </div>
      <div className="mt-1 font-['JetBrains_Mono'] text-[10px] sm:text-xs uppercase tracking-[2px] text-[#4A5568]">
        {label}
      </div>
    </div>
  );
}

function ProgressBar({
  modules,
  progressPercent,
  lang,
}: {
  modules: Module[];
  progressPercent: number;
  lang: Locale;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[3px] text-[#8892A8]">
          {t(LABEL.learningPath, lang)}
        </span>
        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[3px] text-[#00F0FF]">
          {progressPercent}% {t(LABEL.unlocked, lang)}
        </span>
      </div>
      <div className="h-3 sm:h-4 bg-[#0B0E17] border border-[#1E2A42] overflow-hidden">
        <div className="h-full flex gap-[2px] p-[2px]">
          {modules.map((m) => (
            <div
              key={m.id}
              className={`flex-1 transition-colors duration-500 ${
                m.is_locked ? 'bg-[#1A2035]' : 'bg-[#00F0FF]'
              }`}
              style={
                !m.is_locked ? { boxShadow: '0 0 12px rgba(0, 240, 255, 0.45)' } : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleList({
  modules,
  expandedId,
  onToggle,
  completed,
  lang,
}: {
  modules: Module[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  completed: Map<string, number>;
  lang: Locale;
}) {
  return (
    <div className="space-y-4">
      {modules.map((mod) => (
        <ModuleCard
          key={mod.id}
          module={mod}
          expanded={expandedId === mod.id}
          onToggle={() => onToggle(mod.id)}
          completedLessons={completed.get(mod.slug) ?? 0}
          lang={lang}
        />
      ))}
    </div>
  );
}

function ModuleCard({
  module,
  expanded,
  onToggle,
  completedLessons,
  lang,
}: {
  module: Module;
  expanded: boolean;
  onToggle: () => void;
  completedLessons: number;
  lang: Locale;
}) {
  const locked = module.is_locked;
  const accent = ACCENT_TOKENS[module.accent ?? 'cyan'];
  const orderLabel = module.order.toString().padStart(2, '0');
  const totalLessons = module.lessons ?? 0;
  const moduleDone = totalLessons > 0 && completedLessons >= totalLessons;

  return (
    <article
      className={`relative bg-[#131829]/80 border transition-all duration-300 ${
        locked
          ? 'border-[#1E2A42] opacity-70'
          : `border-[#1E2A42] ${accent.hoverBorder} ${accent.hoverGlow}`
      }`}
    >
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        disabled={locked}
        aria-expanded={locked ? undefined : expanded}
        className={`w-full text-left p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5 ${
          locked ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <ModuleIcon icon={module.icon} order={orderLabel} accent={accent} locked={locked} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#4A5568]">
              {t(LABEL.module, lang)} {orderLabel}
            </span>
            {module.difficulty && <Tag>{module.difficulty}</Tag>}
            {moduleDone ? (
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#39FF6B]">
                ✓ {t(LABEL.done, lang)}
              </span>
            ) : locked ? (
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#FF4757]">
                &#9679; {t(LABEL.locked, lang)}
              </span>
            ) : (
              <span className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${accent.text}`}>
                &#9679; {t(LABEL.available, lang)}
              </span>
            )}
            {!locked && totalLessons > 0 && (
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8]">
                {completedLessons}/{totalLessons} {t(LABEL.lessonsWord, lang)}
              </span>
            )}
          </div>

          <h3
            className={`font-['JetBrains_Mono'] text-lg sm:text-xl font-bold leading-snug ${
              locked ? 'text-[#8892A8]' : 'text-[#E4E8F1]'
            }`}
          >
            {module.title}
          </h3>

          {module.description && (
            <p className="mt-2 text-sm text-[#8892A8] leading-relaxed">{module.description}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-['JetBrains_Mono'] text-[11px] uppercase tracking-[2px] text-[#4A5568]">
            {module.duration && (
              <span>
                <span className="text-[#8892A8]">{module.duration}</span>
                {' '} &middot; {' '} {t(LABEL.runtime, lang)}
              </span>
            )}
            {typeof module.lessons === 'number' && module.lessons > 0 && (
              <span>
                <span className="text-[#8892A8]">{module.lessons}</span>{' '}
                {t(LABEL.lessonsWord, lang)}
              </span>
            )}
            {module.topics && module.topics.length > 0 && (
              <span>
                <span className="text-[#8892A8]">{module.topics.length}</span>{' '}
                {t(LABEL.topicsWord, lang)}
              </span>
            )}
          </div>
        </div>

        {!locked && (
          <div className="flex sm:flex-col items-center gap-2 self-start sm:self-center sm:ml-auto">
            <span
              className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${accent.text}`}
              aria-hidden="true"
            >
              {expanded ? t(LABEL.collapse, lang) : t(LABEL.expand, lang)}
            </span>
            <Chevron expanded={expanded} accentText={accent.text} />
          </div>
        )}
      </button>

      {!locked && expanded && (
        <div className="border-t border-[#1E2A42] px-5 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {module.topics && module.topics.length > 0 && (
            <ExpandSection
              label={t(LABEL.topicsCovered, lang)}
              accentDot={accent.dot}
              items={module.topics}
            />
          )}
          {module.objectives && module.objectives.length > 0 && (
            <ExpandSection
              label={t(LABEL.byEndYouCan, lang)}
              accentDot={accent.dot}
              items={module.objectives}
            />
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2">
            <a
              href={`/${lang}/course/${module.slug}`}
              className={`inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border ${accent.border} ${accent.text} hover:bg-[#00F0FF]/10 transition`}
            >
              <span aria-hidden="true">&#9654;</span>
              {completedLessons > 0
                ? t(LABEL.continueModule, lang)
                : t(LABEL.startModule, lang)}{' '}
              {orderLabel}
            </a>
          </div>
        </div>
      )}

      {locked && (
        <div className="border-t border-[#1E2A42] px-5 sm:px-6 py-4 font-['JetBrains_Mono'] text-[11px] uppercase tracking-[2px] text-[#4A5568]">
          {t(LABEL.unlocksAfter, lang)}{' '}
          {(module.order - 1).toString().padStart(2, '0')}
        </div>
      )}
    </article>
  );
}

function ModuleIcon({
  icon,
  order,
  accent,
  locked,
}: {
  icon?: string;
  order: string;
  accent: typeof ACCENT_TOKENS[Accent];
  locked: boolean;
}) {
  return (
    <div
      className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 flex flex-col items-center justify-center border ${
        locked
          ? 'border-[#1E2A42] text-[#4A5568] bg-[#0B0E17]'
          : `${accent.border} ${accent.text} ${accent.bgSoft}`
      }`}
      aria-hidden="true"
    >
      {icon ? (
        <span className="text-2xl leading-none">{icon}</span>
      ) : (
        <span className="font-['Press_Start_2P'] text-xs">{order}</span>
      )}
      {icon && (
        <span
          className={`mt-1 font-['JetBrains_Mono'] text-[9px] tracking-[2px] ${
            locked ? 'text-[#4A5568]' : accent.text
          }`}
        >
          {order}
        </span>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 border border-[#1E2A42] font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#8892A8]">
      {children}
    </span>
  );
}

function Chevron({ expanded, accentText }: { expanded: boolean; accentText: string }) {
  return (
    <svg
      className={`${accentText} transition-transform duration-300 ${
        expanded ? 'rotate-180' : ''
      }`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 5.5 L8 10.5 L13 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

function ExpandSection({
  label,
  accentDot,
  items,
}: {
  label: string;
  accentDot: string;
  items: string[];
}) {
  return (
    <div>
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#4A5568] mb-3">
        {label}
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-[#C8D0E0] leading-relaxed">
            <span
              className={`mt-2 inline-block w-1.5 h-1.5 ${accentDot} shrink-0`}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CertificationCallout({ lang }: { lang: Locale }) {
  return (
    <div className="relative overflow-hidden border border-[#1E2A42] bg-[#131829]/80 p-6 sm:p-8 grid-pattern">
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2">
          <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[3px] text-[#4A5568] mb-2">
            {t(LABEL.certificationTag, lang)}
          </div>
          <h3 className="font-['JetBrains_Mono'] text-xl sm:text-2xl text-[#E4E8F1] font-bold">
            {t(LABEL.certHeadline, lang)}
          </h3>
          <p className="mt-3 text-sm sm:text-base text-[#8892A8] leading-relaxed max-w-2xl">
            {t(LABEL.certBody, lang)}
          </p>
        </div>
        <div className="flex justify-start md:justify-end">
          <a
            href={`/${lang}/game`}
            className="inline-flex items-center gap-2 px-5 py-3 font-['JetBrains_Mono'] uppercase text-xs sm:text-sm tracking-[2px] bg-[#39FF6B]/5 border border-[#39FF6B] text-[#39FF6B] hover:bg-[#39FF6B]/10 hover:shadow-[0_0_25px_rgba(57,255,107,0.25)] transition-all duration-300"
          >
            <span>&#9654;</span> {t(LABEL.warmUp, lang)}
          </a>
        </div>
      </div>
    </div>
  );
}
