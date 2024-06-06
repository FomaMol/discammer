import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The progress util is browser-facing (reads localStorage, dispatches DOM
 * CustomEvents). The vitest suite runs in the `node` environment, so we stand
 * up a minimal in-memory `localStorage` + `window` before importing the module
 * under test. `window.dispatchEvent` / `CustomEvent` are stubbed so the
 * write-back path doesn't blow up outside a DOM.
 */

const PROGRESS_KEY = 'discammer:progress:v1';
const EXAM_KEY = 'discammer:exam:v1';
const CERT_NAME_KEY = 'discammer:certificate:name';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    _map: map,
  };
}

let storage: ReturnType<typeof makeStorage>;
let dispatched: string[];

beforeEach(() => {
  storage = makeStorage();
  dispatched = [];
  // CustomEvent shim — node has no DOM constructor by default.
  class FakeCustomEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;
  (globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    dispatchEvent: (e: { type: string }) => {
      dispatched.push(e.type);
      return true;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  (globalThis as Record<string, unknown>).localStorage = storage;
});

afterEach(() => {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).CustomEvent;
});

/** Re-import the module fresh so it binds to the per-test window/storage. */
async function loadModule() {
  return import('./progress');
}

function seedLessons(modules: Record<string, string[]>) {
  const shape = {
    modules: Object.fromEntries(
      Object.entries(modules).map(([m, lessons]) => [
        m,
        { lessons: Object.fromEntries(lessons.map((l) => [l, true])) },
      ]),
    ),
  };
  storage.setItem(PROGRESS_KEY, JSON.stringify(shape));
}

function seedExam(rec: { passed: boolean; score: number; total: number; passedAt?: string }) {
  storage.setItem(
    EXAM_KEY,
    JSON.stringify({ passedAt: '2026-01-01T00:00:00.000Z', ...rec }),
  );
}

describe('exportProgress / importProgress', () => {
  it('round-trips lessons, exam, and cert name through export → clear → import', async () => {
    const mod = await loadModule();
    seedLessons({ 'module-1': ['intro', 'recap'] });
    seedExam({ passed: true, score: 9, total: 10 });
    storage.setItem(CERT_NAME_KEY, 'Operative Vega');

    const dossier = mod.exportProgress();
    expect(dossier.v).toBe(1);
    expect(typeof dossier.exportedAt).toBe('string');
    expect(dossier.lessons['module-1'].lessons.intro).toBe(true);
    expect(dossier.exams?.score).toBe(9);
    expect(dossier.certName).toBe('Operative Vega');

    // Wipe storage, then re-import the dossier object.
    storage.clear();
    const res = mod.importProgress(dossier);
    expect(res.ok).toBe(true);

    expect(mod.getCompletedLessons('module-1').sort()).toEqual(['intro', 'recap']);
    expect(JSON.parse(storage.getItem(EXAM_KEY) as string).score).toBe(9);
    expect(storage.getItem(CERT_NAME_KEY)).toBe('Operative Vega');
  });

  it('round-trips when the export is serialized to a JSON string', async () => {
    const mod = await loadModule();
    seedLessons({ 'module-2': ['a'] });
    const json = JSON.stringify(mod.exportProgress());
    storage.clear();
    const res = mod.importProgress(json);
    expect(res.ok).toBe(true);
    expect(mod.isLessonComplete('module-2', 'a')).toBe(true);
  });

  it('rejects corrupted / wrong-shape input without throwing or mutating storage', async () => {
    const mod = await loadModule();
    seedLessons({ 'module-1': ['intro'] });
    const before = storage.getItem(PROGRESS_KEY);

    for (const bad of ['{not json', '{}', '[]']) {
      const res = mod.importProgress(bad);
      expect(res.ok).toBe(false);
    }
    // Non-string, non-object too.
    expect(mod.importProgress(null as unknown as object).ok).toBe(false);
    expect(mod.importProgress([] as unknown as object).ok).toBe(false);

    // Storage untouched.
    expect(storage.getItem(PROGRESS_KEY)).toBe(before);
    expect(mod.isLessonComplete('module-1', 'intro')).toBe(true);
  });

  it('rejects downgrade (v:0) and forward (v:2) dossier versions', async () => {
    const mod = await loadModule();
    const base = { exportedAt: 'x', lessons: { m: { lessons: { a: true } } }, exams: null, certName: null };

    const v0 = mod.importProgress({ ...base, v: 0 });
    expect(v0.ok).toBe(false);

    const v2 = mod.importProgress({ ...base, v: 2 });
    expect(v2.ok).toBe(false);

    // Nothing was written.
    expect(storage.getItem(PROGRESS_KEY)).toBe(null);
  });

  it('keeps the better exam score when importing a higher one', async () => {
    const mod = await loadModule();
    seedExam({ passed: false, score: 6, total: 10 });

    const dossier = {
      v: 1,
      exportedAt: 'x',
      lessons: {},
      exams: { passed: true, score: 9, total: 10, passedAt: '2026-02-02T00:00:00.000Z' },
      certName: null,
    };
    const res = mod.importProgress(dossier);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.improvedExams).toBeGreaterThanOrEqual(1);

    const stored = JSON.parse(storage.getItem(EXAM_KEY) as string);
    expect(stored.score).toBe(9);
    expect(stored.passed).toBe(true);
  });

  it('keeps the current better exam score when importing a worse one (no improvement counted)', async () => {
    const mod = await loadModule();
    seedExam({ passed: true, score: 9, total: 10 });

    const dossier = {
      v: 1,
      exportedAt: 'x',
      lessons: {},
      exams: { passed: false, score: 6, total: 10, passedAt: '2026-02-02T00:00:00.000Z' },
      certName: null,
    };
    const res = mod.importProgress(dossier);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.improvedExams).toBe(0);

    const stored = JSON.parse(storage.getItem(EXAM_KEY) as string);
    expect(stored.score).toBe(9);
    expect(stored.passed).toBe(true);
  });

  it('unions lessons: importing A+B onto an existing A adds only B', async () => {
    const mod = await loadModule();
    seedLessons({ 'module-1': ['lesson-a'] });

    const dossier = {
      v: 1,
      exportedAt: 'x',
      lessons: { 'module-1': { lessons: { 'lesson-a': true, 'lesson-b': true } } },
      exams: null,
      certName: null,
    };
    const res = mod.importProgress(dossier);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.addedLessons).toBe(1);

    expect(mod.getCompletedLessons('module-1').sort()).toEqual(['lesson-a', 'lesson-b']);
  });

  it('keeps an already-confirmed cert name and only takes the import when none is set', async () => {
    const mod = await loadModule();

    // No current name → import fills it.
    const filled = mod.importProgress({
      v: 1,
      exportedAt: 'x',
      lessons: {},
      exams: null,
      certName: 'Imported Operative',
    });
    expect(filled.ok).toBe(true);
    expect(storage.getItem(CERT_NAME_KEY)).toBe('Imported Operative');

    // Existing confirmed name → import must NOT overwrite it.
    const kept = mod.importProgress({
      v: 1,
      exportedAt: 'x',
      lessons: {},
      exams: null,
      certName: 'Someone Else',
    });
    expect(kept.ok).toBe(true);
    expect(storage.getItem(CERT_NAME_KEY)).toBe('Imported Operative');
  });
});
