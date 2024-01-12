/**
 * localStorage-backed course progress tracking.
 *
 * Schema:
 *   discammer:progress:v1 = {
 *     modules: {
 *       [moduleSlug]: {
 *         lessons: { [lessonSlug]: true }
 *       }
 *     }
 *   }
 *
 * Lesson completion is the only thing stored; module completion is derived
 * from "all lessons in this module are completed".
 */

const STORAGE_KEY = 'discammer:progress:v1';

type ProgressShape = {
  modules: Record<string, { lessons: Record<string, true> }>;
};

const EMPTY: ProgressShape = { modules: {} };

function read(): ProgressShape {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.modules) return { ...EMPTY };
    return parsed as ProgressShape;
  } catch {
    return { ...EMPTY };
  }
}

function write(state: ProgressShape) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('discammer:progress'));
  } catch {
    // Silent fail — Safari private mode and quota errors are non-fatal.
  }
}

export function isLessonComplete(moduleSlug: string, lessonSlug: string): boolean {
  const state = read();
  return !!state.modules[moduleSlug]?.lessons[lessonSlug];
}

export function markLessonComplete(moduleSlug: string, lessonSlug: string): void {
  const state = read();
  if (!state.modules[moduleSlug]) state.modules[moduleSlug] = { lessons: {} };
  state.modules[moduleSlug].lessons[lessonSlug] = true;
  write(state);
}

export function markLessonIncomplete(moduleSlug: string, lessonSlug: string): void {
  const state = read();
  if (state.modules[moduleSlug]) {
    delete state.modules[moduleSlug].lessons[lessonSlug];
    write(state);
  }
}

export function getCompletedLessons(moduleSlug: string): string[] {
  const state = read();
  return Object.keys(state.modules[moduleSlug]?.lessons ?? {});
}

export function getModuleCompletion(
  moduleSlug: string,
  totalLessons: number
): { completed: number; total: number; ratio: number; done: boolean } {
  const completed = getCompletedLessons(moduleSlug).length;
  const ratio = totalLessons === 0 ? 0 : completed / totalLessons;
  return {
    completed,
    total: totalLessons,
    ratio,
    done: totalLessons > 0 && completed >= totalLessons,
  };
}

export function resetProgress(): void {
  write({ ...EMPTY });
}

export function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener('discammer:progress', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('discammer:progress', handler);
    window.removeEventListener('storage', handler);
  };
}
