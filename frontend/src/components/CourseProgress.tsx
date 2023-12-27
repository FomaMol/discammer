import { useEffect, useMemo, useState } from 'react';
import { fetchCourseModules } from '../utils/api';

type Accent = 'cyan' | 'green' | 'amber' | 'red';

interface Module {
  id: string;
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

const ACCENT_TOKENS: Record<Accent, {
  text: string;
  border: string;
  bgSoft: string;
  glow: string;
  dot: string;
}> = {
  cyan: {
    text: 'text-[#00F0FF]',
    border: 'border-[#00F0FF]',
    bgSoft: 'bg-[#00F0FF]/10',
    glow: 'shadow-[0_0_25px_rgba(0,240,255,0.18)]',
    dot: 'bg-[#00F0FF]',
  },
  green: {
    text: 'text-[#39FF6B]',
    border: 'border-[#39FF6B]',
    bgSoft: 'bg-[#39FF6B]/10',
    glow: 'shadow-[0_0_25px_rgba(57,255,107,0.18)]',
    dot: 'bg-[#39FF6B]',
  },
  amber: {
    text: 'text-[#FFB547]',
    border: 'border-[#FFB547]',
    bgSoft: 'bg-[#FFB547]/10',
    glow: 'shadow-[0_0_25px_rgba(255,181,71,0.18)]',
    dot: 'bg-[#FFB547]',
  },
  red: {
    text: 'text-[#FF4757]',
    border: 'border-[#FF4757]',
    bgSoft: 'bg-[#FF4757]/10',
    glow: 'shadow-[0_0_25px_rgba(255,71,87,0.18)]',
    dot: 'bg-[#FF4757]',
  },
};

function normalize(api: ApiModule, idx: number): Module {
  const order = api.order ?? api.number ?? idx + 1;
  const accentRaw = (api.accent || 'cyan').toLowerCase();
  const accent: Accent = (['cyan', 'green', 'amber', 'red'] as Accent[]).includes(accentRaw as Accent)
    ? (accentRaw as Accent)
    : 'cyan';
  return {
    id: String(api.id ?? order),
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

export default function CourseProgress() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCourseModules()
      .then((data) => {
        const list: ApiModule[] = Array.isArray(data) ? data : data?.modules ?? [];
        const normalized = list.map(normalize);
        setModules(normalized);
        const firstUnlocked = normalized.find((m) => !m.is_locked);
        if (firstUnlocked) setExpandedId(firstUnlocked.id);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalLessons = modules.reduce((sum, m) => sum + (m.lessons ?? 0), 0);
    const unlocked = modules.filter((m) => !m.is_locked).length;
    const totalMinutes = modules.reduce((sum, m) => {
      const match = m.duration?.match(/(\d+)/);
      return sum + (match ? parseInt(match[1], 10) : 0);
    }, 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return {
      moduleCount: modules.length,
      totalLessons,
      unlocked,
      duration: hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`,
    };
  }, [modules]);

  const progressPercent = stats.moduleCount > 0
    ? Math.round((stats.unlocked / stats.moduleCount) * 100)
    : 0;

  if (loading) {
    return (
      <div className="py-12 text-center font-['JetBrains_Mono'] text-sm text-[#4A5568]">
        &gt; Loading training program<span className="cursor-blink" />
      </div>
    );
  }

  if (error || modules.length === 0) {
    return (
      <div className="py-12 text-center font-['JetBrains_Mono'] text-sm text-[#FF4757]">
        &gt; ERROR: training modules unavailable.
      </div>
    );
  }

  return (
    <section className="space-y-12">
      <StatsBanner stats={stats} progressPercent={progressPercent} />

      <ProgressBar modules={modules} progressPercent={progressPercent} />

      <ModuleList
        modules={modules}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
      />

      <CertificationCallout />
    </section>
  );
}

function StatsBanner({
  stats,
  progressPercent,
}: {
  stats: { moduleCount: number; totalLessons: number; unlocked: number; duration: string };
  progressPercent: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-[#1E2A42] bg-[#0B0E17]/60 divide-y md:divide-y-0 md:divide-x divide-[#1E2A42]">
      <StatCell label="Modules" value={stats.moduleCount.toString().padStart(2, '0')} accent="text-[#00F0FF] glow-cyan" />
      <StatCell label="Lessons" value={stats.totalLessons.toString()} accent="text-[#39FF6B]" />
      <StatCell label="Total time" value={stats.duration} accent="text-[#FFB547]" />
      <StatCell label="Progress" value={`${progressPercent}%`} accent="text-[#E4E8F1]" />
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-4 py-5 sm:py-6">
      <div className={`font-['JetBrains_Mono'] text-xl sm:text-2xl font-bold ${accent}`}>{value}</div>
      <div className="mt-1 font-['JetBrains_Mono'] text-[10px] sm:text-xs uppercase tracking-[2px] text-[#4A5568]">
        {label}
      </div>
    </div>
  );
}

function ProgressBar({ modules, progressPercent }: { modules: Module[]; progressPercent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[3px] text-[#8892A8]">
          Learning path
        </span>
        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-[3px] text-[#00F0FF]">
          {progressPercent}% unlocked
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
                !m.is_locked
                  ? { boxShadow: '0 0 12px rgba(0, 240, 255, 0.45)' }
                  : undefined
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
}: {
  modules: Module[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {modules.map((mod) => (
        <ModuleCard
          key={mod.id}
          module={mod}
          expanded={expandedId === mod.id}
          onToggle={() => onToggle(mod.id)}
        />
      ))}
    </div>
  );
}

function ModuleCard({
  module,
  expanded,
  onToggle,
}: {
  module: Module;
  expanded: boolean;
  onToggle: () => void;
}) {
  const locked = module.is_locked;
  const accent = ACCENT_TOKENS[module.accent ?? 'cyan'];
  const orderLabel = module.order.toString().padStart(2, '0');

  return (
    <article
      className={`relative bg-[#131829]/80 border transition-all duration-300 ${
        locked
          ? 'border-[#1E2A42] opacity-70'
          : `border-[#1E2A42] hover:${accent.border} hover:${accent.glow}`
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-5 cursor-pointer"
      >
        <ModuleIcon icon={module.icon} order={orderLabel} accent={accent} locked={locked} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[3px] text-[#4A5568]">
              Module {orderLabel}
            </span>
            {module.difficulty && (
              <Tag>{module.difficulty}</Tag>
            )}
            {locked ? (
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#FF4757]">
                &#9679; Locked
              </span>
            ) : (
              <span className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${accent.text}`}>
                &#9679; Available
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
              <span><span className="text-[#8892A8]">{module.duration}</span> &middot; runtime</span>
            )}
            {typeof module.lessons === 'number' && module.lessons > 0 && (
              <span><span className="text-[#8892A8]">{module.lessons}</span> lessons</span>
            )}
            {module.topics && module.topics.length > 0 && (
              <span><span className="text-[#8892A8]">{module.topics.length}</span> topics</span>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center gap-2 self-start sm:self-center sm:ml-auto">
          <span
            className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] ${
              locked ? 'text-[#4A5568]' : accent.text
            }`}
            aria-hidden="true"
          >
            {expanded ? 'Collapse' : 'Preview'}
          </span>
          <Chevron
            expanded={expanded}
            accentText={locked ? 'text-[#4A5568]' : accent.text}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#1E2A42] px-5 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {module.topics && module.topics.length > 0 && (
            <ExpandSection
              label="Topics covered"
              accentDot={locked ? 'bg-[#4A5568]' : accent.dot}
              items={module.topics}
            />
          )}
          {module.objectives && module.objectives.length > 0 && (
            <ExpandSection
              label="By the end you can"
              accentDot={locked ? 'bg-[#4A5568]' : accent.dot}
              items={module.objectives}
            />
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2">
            {locked ? (
              <>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] border border-[#1E2A42] text-[#4A5568] cursor-not-allowed">
                  <span>&#128274;</span> Locked
                </span>
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568]">
                  Unlocks after Module {(module.order - 1).toString().padStart(2, '0')}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`inline-flex items-center gap-2 px-5 py-2.5 font-['JetBrains_Mono'] uppercase text-xs tracking-[2px] bg-[#00F0FF]/5 border ${accent.border} ${accent.text}`}
                >
                  <span>&#9654;</span> Start module {orderLabel}
                </span>
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[2px] text-[#4A5568]">
                  Interactive lessons launch soon
                </span>
              </>
            )}
          </div>
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
        locked ? 'border-[#1E2A42] text-[#4A5568] bg-[#0B0E17]' : `${accent.border} ${accent.text} ${accent.bgSoft}`
      }`}
      aria-hidden="true"
    >
      {icon ? (
        <span className="text-2xl leading-none">{icon}</span>
      ) : (
        <span className="font-['Press_Start_2P'] text-xs">{order}</span>
      )}
      {icon && (
        <span className={`mt-1 font-['JetBrains_Mono'] text-[9px] tracking-[2px] ${locked ? 'text-[#4A5568]' : accent.text}`}>
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
      className={`${accentText} transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 5.5 L8 10.5 L13 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
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
            <span className={`mt-2 inline-block w-1.5 h-1.5 ${accentDot} shrink-0`} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CertificationCallout() {
  return (
    <div className="relative overflow-hidden border border-[#1E2A42] bg-[#131829]/80 p-6 sm:p-8 grid-pattern">
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2">
          <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-[3px] text-[#4A5568] mb-2">
            // CERTIFICATION
          </div>
          <h3 className="font-['JetBrains_Mono'] text-xl sm:text-2xl text-[#E4E8F1] font-bold">
            Earn the DiScammer Defender certificate.
          </h3>
          <p className="mt-3 text-sm sm:text-base text-[#8892A8] leading-relaxed max-w-2xl">
            Finish all nine modules and pass the capstone simulation to receive a
            shareable certificate verifying that you can recognize, respond to, and
            recover from modern digital fraud.
          </p>
        </div>
        <div className="flex justify-start md:justify-end">
          <a
            href="/game"
            className="inline-flex items-center gap-2 px-5 py-3 font-['JetBrains_Mono'] uppercase text-xs sm:text-sm tracking-[2px] bg-[#39FF6B]/5 border border-[#39FF6B] text-[#39FF6B] hover:bg-[#39FF6B]/10 hover:shadow-[0_0_25px_rgba(57,255,107,0.25)] transition-all duration-300"
          >
            <span>&#9654;</span> Warm up in the simulator
          </a>
        </div>
      </div>
    </div>
  );
}
