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
  return !!state.modules[moduleSlug]?.lessons?.[lessonSlug];
}

export function markLessonComplete(moduleSlug: string, lessonSlug: string): void {
  const state = read();
  // Re-create the entry if missing or corrupted (e.g. stored without `lessons`).
  if (!state.modules[moduleSlug]?.lessons) state.modules[moduleSlug] = { lessons: {} };
  state.modules[moduleSlug].lessons[lessonSlug] = true;
  write(state);
}

export function markLessonIncomplete(moduleSlug: string, lessonSlug: string): void {
  const state = read();
  const lessons = state.modules[moduleSlug]?.lessons;
  if (lessons) {
    delete lessons[lessonSlug];
    write(state);
  }
}

export function getCompletedLessons(moduleSlug: string): string[] {
  const state = read();
  return Object.keys(state.modules[moduleSlug]?.lessons ?? {});
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

/* ------------------------------------------------------------------------- *
 * Dossier export / import ("досье оперативника").
 *
 * A single portable file that bundles the three pieces of operator state held
 * in localStorage so progress can move between browsers / devices:
 *   - lessons   → the discammer:progress:v1 `modules` structure
 *   - exams     → discammer:exam:v1 (best-of exam record)
 *   - certName  → discammer:certificate:name (the operative name)
 *
 * Import is non-destructive ("best-of"): nothing already earned is ever lost.
 * ------------------------------------------------------------------------- */

const EXAM_KEY = 'discammer:exam:v1';
const CERT_NAME_KEY = 'discammer:certificate:name';

/** Current dossier format version. Bump only on a breaking schema change. */
const DOSSIER_VERSION = 1;

/** Shape of discammer:exam:v1 as written by ExamWidget. */
interface ExamRecord {
  passed: boolean;
  score: number;
  total: number;
  passedAt: string;
}

export interface Dossier {
  v: number;
  exportedAt: string;
  lessons: ProgressShape['modules'];
  exams: ExamRecord | null;
  certName: string | null;
}

export interface ImportOk {
  ok: true;
  addedLessons: number;
  improvedExams: number;
}

export interface ImportErr {
  ok: false;
  error: string;
}

function readExamRecord(): ExamRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.passed === 'boolean' &&
      typeof parsed.score === 'number' &&
      typeof parsed.total === 'number'
    ) {
      return parsed as ExamRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function readCertName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CERT_NAME_KEY);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

/** A name counts as "confirmed" once it has ≥ 2 trimmed chars (CertificateWidget guard). */
function isConfirmedName(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length >= 2;
}

/**
 * Build the operator dossier from the three localStorage sources. Safe to call
 * during SSR (returns an empty, well-formed dossier).
 */
export function exportProgress(): Dossier {
  const lessons = read().modules;
  return {
    v: DOSSIER_VERSION,
    exportedAt: new Date().toISOString(),
    lessons,
    exams: readExamRecord(),
    certName: readCertName(),
  };
}

/** Best-of exam ratio, guarding against a zero/total of 0. */
function examRatio(rec: ExamRecord | null): number {
  if (!rec || rec.total <= 0) return 0;
  return rec.score / rec.total;
}

/**
 * Merge an exported dossier into the current localStorage state. Non-destructive
 * "best-of": completed lessons are unioned, the better exam score wins (a passed
 * exam stays passed), and a confirmed operative name is never overwritten.
 *
 * Defensive by contract: a corrupted, foreign, or wrong-version file returns
 * `{ ok: false, error }` and never throws. Never mutates storage on rejection.
 */
export function importProgress(json: string | object): ImportOk | ImportErr {
  let data: unknown;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      return { ok: false, error: 'not-json' };
    }
  } else {
    data = json;
  }

  // Top-level shape guards — reject anything that isn't a plain object.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'not-an-object' };
  }
  const d = data as Record<string, unknown>;

  // Version guard: require a numeric `v` in (0, DOSSIER_VERSION]. A v:0 / v:2
  // (downgrade / forward-compat) is rejected with a clear error.
  if (typeof d.v !== 'number' || d.v < 1 || d.v > DOSSIER_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }

  // `lessons` must be an object map; `exams` must be null/undefined or an object.
  if (!d.lessons || typeof d.lessons !== 'object' || Array.isArray(d.lessons)) {
    return { ok: false, error: 'bad-lessons' };
  }
  if (
    d.exams !== undefined &&
    d.exams !== null &&
    (typeof d.exams !== 'object' || Array.isArray(d.exams))
  ) {
    return { ok: false, error: 'bad-exams' };
  }

  const importedModules = d.lessons as ProgressShape['modules'];

  // ---- Merge lessons (UNION) -------------------------------------------------
  const current = read();
  let addedLessons = 0;
  for (const [moduleSlug, mod] of Object.entries(importedModules)) {
    const lessons = mod && typeof mod === 'object' ? (mod as { lessons?: unknown }).lessons : null;
    if (!lessons || typeof lessons !== 'object') continue;
    for (const [lessonSlug, done] of Object.entries(lessons as Record<string, unknown>)) {
      if (done !== true) continue;
      if (!current.modules[moduleSlug]?.lessons) current.modules[moduleSlug] = { lessons: {} };
      if (!current.modules[moduleSlug].lessons[lessonSlug]) {
        current.modules[moduleSlug].lessons[lessonSlug] = true;
        addedLessons += 1;
      }
    }
  }

  // ---- Merge exam (best-of score, OR-in passed) ------------------------------
  let improvedExams = 0;
  const importedExam = (d.exams ?? null) as ExamRecord | null;
  const validImported =
    importedExam &&
    typeof importedExam.passed === 'boolean' &&
    typeof importedExam.score === 'number' &&
    typeof importedExam.total === 'number';
  if (validImported) {
    const currentExam = readExamRecord();
    const curRatio = examRatio(currentExam);
    const impRatio = examRatio(importedExam);
    // Strictly better score (or a newly-introduced record) counts as improved.
    if (!currentExam || impRatio > curRatio) {
      const merged: ExamRecord = {
        score: importedExam.score,
        total: importedExam.total,
        passed: importedExam.passed || currentExam?.passed === true,
        passedAt: importedExam.passedAt || currentExam?.passedAt || new Date().toISOString(),
      };
      writeExamRecord(merged);
      improvedExams += 1;
    } else if (importedExam.passed && currentExam && !currentExam.passed) {
      // Score didn't improve, but the import proves a pass — OR it in.
      writeExamRecord({ ...currentExam, passed: true });
    }
  }

  // ---- Merge cert name (keep confirmed current name, else take imported) -----
  const currentName = readCertName();
  if (!isConfirmedName(currentName)) {
    const importedName = typeof d.certName === 'string' ? d.certName : null;
    if (isConfirmedName(importedName)) writeCertName(importedName as string);
  }

  // Persist merged lesson state and notify the UI (exam writes already fired).
  write(current);

  return { ok: true, addedLessons, improvedExams };
}

function writeExamRecord(rec: ExamRecord) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXAM_KEY, JSON.stringify(rec));
    window.dispatchEvent(new CustomEvent('discammer:exam'));
  } catch {
    // Silent fail — Safari private mode and quota errors are non-fatal.
  }
}

function writeCertName(name: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CERT_NAME_KEY, name);
  } catch {
    // Silent fail — Safari private mode and quota errors are non-fatal.
  }
}
