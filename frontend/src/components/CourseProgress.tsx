import { useEffect, useState } from 'react';
import { fetchCourseModules } from '../utils/api';

interface Module {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: 'locked' | 'unlocked' | 'completed';
}

export default function CourseProgress() {
  const [modules, setModules] = useState<Module[]>([]);

  useEffect(() => {
    fetchCourseModules()
      .then((data) => setModules(Array.isArray(data) ? data : data.modules ?? []))
      .catch(() => setModules([]));
  }, []);

  const completedCount = modules.filter((m) => m.status === 'completed').length;
  const progressPercent = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  return (
    <section className="py-8">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs text-text-secondary uppercase tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            Course Progress
          </span>
          <span
            className="text-xs text-accent-cyan"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            {progressPercent}%
          </span>
        </div>
        <div className="h-4 bg-bg-secondary border border-border-default overflow-hidden">
          {/* Pixel-art style segmented bar */}
          <div className="h-full flex gap-[2px] p-[2px]">
            {modules.map((m, i) => (
              <div
                key={m.id || i}
                className={`flex-1 transition-colors duration-300 ${
                  m.status === 'completed'
                    ? 'bg-accent-green'
                    : m.status === 'unlocked'
                    ? 'bg-accent-cyan-dim'
                    : 'bg-bg-surface'
                }`}
              />
            ))}
            {modules.length === 0 && <div className="flex-1 bg-bg-surface" />}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-8">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border-default" />

        {modules.map((mod, i) => {
          const isCompleted = mod.status === 'completed';
          const isUnlocked = mod.status === 'unlocked';
          const isLocked = mod.status === 'locked';

          return (
            <div key={mod.id || i} className="relative mb-6 last:mb-0">
              {/* Node */}
              <div
                className={`absolute -left-5 top-1 w-6 h-6 border-2 flex items-center justify-center text-[8px]
                  ${isCompleted
                    ? 'bg-accent-green/20 border-accent-green text-accent-green'
                    : isUnlocked
                    ? 'bg-accent-cyan/20 border-accent-cyan text-accent-cyan'
                    : 'bg-bg-surface border-border-default text-text-muted'
                  }`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                {isCompleted ? '\u2713' : isLocked ? '\u2716' : mod.number}
              </div>

              {/* Content */}
              <div
                className={`bg-bg-panel border rounded-md p-4 transition-all duration-300 ${
                  isLocked
                    ? 'border-border-default opacity-50'
                    : 'border-border-default hover:border-accent-cyan-dim hover:box-glow-cyan'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className="text-[10px] text-text-muted uppercase tracking-widest"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    Module {mod.number.toString().padStart(2, '0')}
                  </span>
                  {isLocked && (
                    <span className="text-[10px] text-accent-red uppercase tracking-wider">
                      [LOCKED]
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[10px] text-accent-green uppercase tracking-wider">
                      [COMPLETE]
                    </span>
                  )}
                </div>
                <h3 className="text-text-primary text-sm font-semibold mb-1">{mod.title}</h3>
                {mod.description && (
                  <p className="text-text-secondary text-xs">{mod.description}</p>
                )}
              </div>
            </div>
          );
        })}

        {modules.length === 0 && (
          <div
            className="text-text-muted text-sm py-8 text-center"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            &gt; Loading modules...
          </div>
        )}
      </div>
    </section>
  );
}
