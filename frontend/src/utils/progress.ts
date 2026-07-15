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
const LESSON_REVISIONS_KEY = 'discammer:lesson-revisions:v1';
type LessonRevisions = Record<string, true>;

function revisionKey(moduleSlug: string, lessonSlug: string, revision: string): string {
  return `${moduleSlug}/${lessonSlug}@${revision}`;
}

function readLessonRevisions(): LessonRevisions {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LESSON_REVISIONS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
      /^[a-z0-9-]+\/[a-z0-9-]+@[a-z0-9-]+$/.test(key) && value === true)) as LessonRevisions;
  } catch { return {}; }
}

function writeLessonRevisions(rows: LessonRevisions): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LESSON_REVISIONS_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent('discammer:progress'));
  } catch { /* Storage may be denied. */ }
}

export function isLessonRevisionComplete(moduleSlug: string, lessonSlug: string, revision: string): boolean {
  return readLessonRevisions()[revisionKey(moduleSlug, lessonSlug, revision)] === true;
}

export function markLessonRevisionComplete(moduleSlug: string, lessonSlug: string, revision: string): void {
  const rows = readLessonRevisions();
  rows[revisionKey(moduleSlug, lessonSlug, revision)] = true;
  writeLessonRevisions(rows);
}

export function markLessonRevisionIncomplete(moduleSlug: string, lessonSlug: string, revision: string): void {
  const rows = readLessonRevisions();
  delete rows[revisionKey(moduleSlug, lessonSlug, revision)];
  writeLessonRevisions(rows);
}

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

export type CurrentLessonSummary = { slug: string; content_revision?: string | null };

/** Counts the revision taught now while preserving earlier slug progress separately. */
export function getCurrentCompletedLessons(moduleSlug: string, lessons: CurrentLessonSummary[]): string[] {
  const legacy = read().modules[moduleSlug]?.lessons ?? {};
  const revisions = readLessonRevisions();
  return lessons.filter((lesson) => lesson.content_revision
    ? revisions[revisionKey(moduleSlug, lesson.slug, lesson.content_revision)] === true
    : legacy[lesson.slug] === true).map((lesson) => lesson.slug);
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
const EXAM_REVISIONS_KEY = 'discammer:exam-revisions:v1';
const CERT_NAME_KEY = 'discammer:certificate:name';
const GUIDE_CHECKS_KEY = 'discammer:guidechecks:v1';

/**
 * Current dossier format version. Bump only on a breaking schema change.
 *
 * v:1 → v:2 added `guideChecks` (per-guide knowledge checks). The importer is
 * FORWARD-COMPATIBLE: a v:1 dossier (no `guideChecks`) imports cleanly, with
 * the missing field treated as empty — see `importProgress`.
 */
const DOSSIER_VERSION = 2;

/** Shape of discammer:exam:v1 as written by ExamWidget. */
export interface ExamRecord {
  passed: boolean;
  score: number;
  total: number;
  passedAt: string;
}
type ExamRevisions = Record<string, ExamRecord>;

function validExamRecord(rec: unknown): rec is ExamRecord {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  const value = rec as Partial<ExamRecord>;
  return typeof value.passed === 'boolean'
    && typeof value.score === 'number' && Number.isFinite(value.score)
    && typeof value.total === 'number' && Number.isFinite(value.total)
    && value.total > 0 && value.score >= 0 && value.score <= value.total
    && typeof value.passedAt === 'string' && !Number.isNaN(Date.parse(value.passedAt));
}

function readExamRevisions(): ExamRevisions {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(EXAM_REVISIONS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
      /^[a-z0-9][a-z0-9-]{2,40}$/.test(key) && validExamRecord(value))) as ExamRevisions;
  } catch { return {}; }
}

function writeExamRevisions(rows: ExamRevisions): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXAM_REVISIONS_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent('discammer:exam'));
  } catch { /* Storage may be denied. */ }
}

export function getExamRevisionRecord(revision: string): ExamRecord | null {
  return readExamRevisions()[revision] ?? null;
}

export function recordExamRevisionResult(revision: string, result: ExamRecord): void {
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(revision) || !validExamRecord(result)) return;
  const rows = readExamRevisions();
  const old = rows[revision];
  if (old?.passed && (!result.passed || examRatio(old) > examRatio(result))) return;
  rows[revision] = result;
  writeExamRevisions(rows);
}

/** One per-guide knowledge-check result (best-of), as written by KnowledgeCheck. */
export interface GuideCheckRecord {
  score: number;
  bestOf: number;
  at: string;
}

/** Map of guide slug → best-of knowledge-check result. */
export type GuideChecks = Record<string, GuideCheckRecord>;

export interface Dossier {
  v: number;
  exportedAt: string;
  lessons: ProgressShape['modules'];
  exams: ExamRecord | null;
  certName: string | null;
  guideChecks: GuideChecks;
  lessonRevisions?: LessonRevisions;
  revisedExams?: ExamRevisions;
}

export interface ImportOk {
  ok: true;
  addedLessons: number;
  improvedExams: number;
  improvedGuideChecks: number;
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

/** True when `rec` is a well-formed guide-check record (defensive against corruption). */
function isGuideCheckRecord(rec: unknown): rec is GuideCheckRecord {
  return (
    !!rec &&
    typeof rec === 'object' &&
    typeof (rec as GuideCheckRecord).score === 'number' &&
    typeof (rec as GuideCheckRecord).bestOf === 'number'
  );
}

/**
 * Read the per-guide knowledge-check map from storage. Corrupted entries are
 * skipped rather than failing the whole read; never throws.
 */
function readGuideChecks(): GuideChecks {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GUIDE_CHECKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: GuideChecks = {};
    for (const [slug, rec] of Object.entries(parsed as Record<string, unknown>)) {
      if (isGuideCheckRecord(rec)) {
        out[slug] = {
          score: rec.score,
          bestOf: rec.bestOf,
          at: typeof rec.at === 'string' ? rec.at : '',
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeGuideChecks(checks: GuideChecks) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUIDE_CHECKS_KEY, JSON.stringify(checks));
    window.dispatchEvent(new CustomEvent('discammer:guidechecks'));
  } catch {
    // Silent fail — Safari private mode and quota errors are non-fatal.
  }
}

/** Best-of guide-check ratio, guarding against a bestOf of 0. */
function guideCheckRatio(rec: GuideCheckRecord | null | undefined): number {
  if (!rec || rec.bestOf <= 0) return 0;
  return rec.score / rec.bestOf;
}

/** The stored best-of knowledge-check for a guide, or null if none / corrupted. */
export function getGuideCheck(slug: string): GuideCheckRecord | null {
  return readGuideChecks()[slug] ?? null;
}

/**
 * Record a knowledge-check result for `slug`. Best-of merge: the new result only
 * overwrites the stored one when its score/bestOf ratio is strictly better
 * (guarding bestOf > 0). Stores an ISO timestamp under `at`.
 */
export function recordGuideCheck(slug: string, score: number, bestOf: number): void {
  if (!slug || bestOf <= 0) return;
  const checks = readGuideChecks();
  const next: GuideCheckRecord = { score, bestOf, at: new Date().toISOString() };
  const current = checks[slug];
  if (!current || guideCheckRatio(next) > guideCheckRatio(current)) {
    checks[slug] = next;
    writeGuideChecks(checks);
  }
}

/**
 * Build the operator dossier from the four localStorage sources. Safe to call
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
    guideChecks: readGuideChecks(),
    lessonRevisions: readLessonRevisions(),
    revisedExams: readExamRevisions(),
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

  // Version guard: require a numeric `v` in [1, DOSSIER_VERSION]. A v:1 dossier
  // (no `guideChecks`) imports cleanly — forward-compatible. A v:0 (downgrade)
  // or a future v:3 is rejected with a clear error.
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
  // `guideChecks` is OPTIONAL (absent on v:1). When present it must be an object
  // map; an array / scalar is a malformed file.
  if (
    d.guideChecks !== undefined &&
    d.guideChecks !== null &&
    (typeof d.guideChecks !== 'object' || Array.isArray(d.guideChecks))
  ) {
    return { ok: false, error: 'bad-guidechecks' };
  }
  if (d.lessonRevisions !== undefined && (
    !d.lessonRevisions || typeof d.lessonRevisions !== 'object' || Array.isArray(d.lessonRevisions) ||
    Object.entries(d.lessonRevisions).some(([key, value]) =>
      !/^[a-z0-9-]+\/[a-z0-9-]+@[a-z0-9-]+$/.test(key) || value !== true)
  )) return { ok: false, error: 'bad-lesson-revisions' };
  if (d.revisedExams !== undefined && (
    !d.revisedExams || typeof d.revisedExams !== 'object' || Array.isArray(d.revisedExams) ||
    Object.entries(d.revisedExams).some(([key, value]) =>
      !/^[a-z0-9][a-z0-9-]{2,40}$/.test(key) || !validExamRecord(value))
  )) return { ok: false, error: 'bad-revised-exams' };

  const importedModules = d.lessons as ProgressShape['modules'];

  // ---- Merge lessons (UNION) -------------------------------------------------
  const current = read();
  // A current revision and its legacy slug describe one lesson to the learner.
  // Count each newly imported lesson once for the visible merge result.
  const addedLessonKeys = new Set<string>();
  for (const [moduleSlug, mod] of Object.entries(importedModules)) {
    const lessons = mod && typeof mod === 'object' ? (mod as { lessons?: unknown }).lessons : null;
    if (!lessons || typeof lessons !== 'object') continue;
    for (const [lessonSlug, done] of Object.entries(lessons as Record<string, unknown>)) {
      if (done !== true) continue;
      if (!current.modules[moduleSlug]?.lessons) current.modules[moduleSlug] = { lessons: {} };
      if (!current.modules[moduleSlug].lessons[lessonSlug]) {
        current.modules[moduleSlug].lessons[lessonSlug] = true;
        addedLessonKeys.add(`${moduleSlug}/${lessonSlug}`);
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
  const revisedExams = (d.revisedExams || {}) as ExamRevisions;
  for (const [revision, result] of Object.entries(revisedExams)) {
    const old = getExamRevisionRecord(revision);
    if (!old || examRatio(result) > examRatio(old)) {
      recordExamRevisionResult(revision, { ...result, passed: result.passed || old?.passed === true });
      improvedExams += 1;
    } else if (result.passed && !old.passed) {
      recordExamRevisionResult(revision, { ...old, passed: true });
    }
  }

  // ---- Merge cert name (keep confirmed current name, else take imported) -----
  const currentName = readCertName();
  if (!isConfirmedName(currentName)) {
    const importedName = typeof d.certName === 'string' ? d.certName : null;
    if (isConfirmedName(importedName)) writeCertName(importedName as string);
  }

  // ---- Merge guide checks (best-of by slug) ----------------------------------
  // Absent on a v:1 dossier → treated as empty (no-op). Corrupted entries are
  // skipped, never throw, and a strictly-better imported ratio wins per slug.
  let improvedGuideChecks = 0;
  const importedChecks = (d.guideChecks ?? {}) as Record<string, unknown>;
  if (importedChecks && typeof importedChecks === 'object' && !Array.isArray(importedChecks)) {
    const currentChecks = readGuideChecks();
    let guideChecksDirty = false;
    for (const [slug, rec] of Object.entries(importedChecks)) {
      if (!isGuideCheckRecord(rec) || rec.bestOf <= 0) continue;
      const incoming: GuideCheckRecord = {
        score: rec.score,
        bestOf: rec.bestOf,
        at: typeof rec.at === 'string' ? rec.at : new Date().toISOString(),
      };
      const existing = currentChecks[slug];
      if (!existing || guideCheckRatio(incoming) > guideCheckRatio(existing)) {
        currentChecks[slug] = incoming;
        improvedGuideChecks += 1;
        guideChecksDirty = true;
      }
    }
    if (guideChecksDirty) writeGuideChecks(currentChecks);
  }

  // Persist merged lesson state and notify the UI (exam writes already fired).
  const incomingRevisions = (d.lessonRevisions || {}) as LessonRevisions;
  if (Object.keys(incomingRevisions).length) {
    const existingRevisions = readLessonRevisions();
    for (const key of Object.keys(incomingRevisions)) {
      if (!existingRevisions[key]) addedLessonKeys.add(key.split('@')[0]);
    }
    writeLessonRevisions({ ...existingRevisions, ...incomingRevisions });
  }
  write(current);

  return { ok: true, addedLessons: addedLessonKeys.size, improvedExams, improvedGuideChecks };
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
