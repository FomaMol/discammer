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
const GUIDE_CHECKS_KEY = 'discammer:guidechecks:v1';

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

function seedGuideChecks(checks: Record<string, { score: number; bestOf: number; at?: string }>) {
  const withAt = Object.fromEntries(
    Object.entries(checks).map(([slug, r]) => [
      slug,
      { at: '2026-01-01T00:00:00.000Z', ...r },
    ]),
  );
  storage.setItem(GUIDE_CHECKS_KEY, JSON.stringify(withAt));
}

describe('exportProgress / importProgress', () => {
  it('preserves an earlier exam while syncing the revised exam separately', async () => {
    const mod = await loadModule();
    seedExam({ passed: true, score: 9, total: 10 });
    expect(mod.getExamRevisionRecord('2026-10-20')).toBeNull();
    mod.recordExamRevisionResult('2026-10-20', { passed: true, score: 34, total: 40, passedAt: '2026-10-20T00:00:00Z' });
    expect(mod.getExamRevisionRecord('2026-10-20')?.score).toBe(34);
    expect(JSON.parse(storage.getItem(EXAM_KEY) as string).score).toBe(9);
    const dossier = mod.exportProgress();
    expect(dossier.revisedExams?.['2026-10-20']?.score).toBe(34);
    storage.clear();
    expect(mod.importProgress(dossier).ok).toBe(true);
    expect(mod.getExamRevisionRecord('2026-10-20')?.passed).toBe(true);
    expect(JSON.parse(storage.getItem(EXAM_KEY) as string).score).toBe(9);
    const bad = { ...dossier, revisedExams: { '2026-10-20': { passed: 'true' } } };
    const before = mod.exportProgress();
    expect(mod.importProgress(bad)).toEqual({ ok: false, error: 'bad-revised-exams' });
    expect(mod.exportProgress().revisedExams).toEqual(before.revisedExams);
  });

  it('counts only current revised lessons in a course overview', async () => {
    const mod = await loadModule();
    seedLessons({ phishing: ['lookalike-domains', 'email-anatomy'] });
    const current = [
      { slug: 'lookalike-domains', content_revision: '2026-10-20' },
      { slug: 'email-anatomy', content_revision: null },
    ];
    expect(mod.getCurrentCompletedLessons('phishing', current)).toEqual(['email-anatomy']);
    mod.markLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20');
    expect(mod.getCurrentCompletedLessons('phishing', current)).toEqual(['lookalike-domains', 'email-anatomy']);
    mod.markLessonRevisionIncomplete('phishing', 'lookalike-domains', '2026-10-20');
    expect(mod.getCurrentCompletedLessons('phishing', current)).toEqual(['email-anatomy']);
    expect(mod.getCompletedLessons('phishing')).toContain('lookalike-domains');
  });

  it('keeps old lesson completion separate from revised completion through export, import and merge', async () => {
    const mod = await loadModule();
    mod.markLessonComplete('phishing', 'lookalike-domains');
    expect(mod.isLessonComplete('phishing', 'lookalike-domains')).toBe(true);
    expect(mod.isLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20')).toBe(false);
    mod.markLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20');
    const dossier = mod.exportProgress();
    expect(dossier.lessonRevisions?.['phishing/lookalike-domains@2026-10-20']).toBe(true);
    storage.clear();
    expect(mod.importProgress(dossier).ok).toBe(true);
    expect(mod.isLessonComplete('phishing', 'lookalike-domains')).toBe(true);
    expect(mod.isLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20')).toBe(true);
    mod.markLessonRevisionIncomplete('phishing', 'lookalike-domains', '2026-10-20');
    expect(mod.isLessonComplete('phishing', 'lookalike-domains')).toBe(true);
    expect(mod.isLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20')).toBe(false);
    expect(mod.importProgress(dossier).ok).toBe(true);
    expect(mod.isLessonRevisionComplete('phishing', 'lookalike-domains', '2026-10-20')).toBe(true);
  });

  it('rejects malformed revised-completion imports before mutating state', async () => {
    const mod = await loadModule();
    mod.markLessonComplete('phishing', 'lookalike-domains');
    const original = storage.getItem(PROGRESS_KEY);
    const bad = { ...mod.exportProgress(), lessonRevisions: { 'phishing/lookalike-domains@2026-10-20': 'true' } };
    expect(mod.importProgress(bad)).toEqual({ ok: false, error: 'bad-lesson-revisions' });
    expect(storage.getItem(PROGRESS_KEY)).toBe(original);
  });

  it('round-trips lessons, exam, cert name, and guide checks through export → clear → import', async () => {
    const mod = await loadModule();
    seedLessons({ 'module-1': ['intro', 'recap'] });
    seedExam({ passed: true, score: 9, total: 10 });
    seedGuideChecks({ phishing: { score: 3, bestOf: 3 } });
    storage.setItem(CERT_NAME_KEY, 'Operative Vega');

    const dossier = mod.exportProgress();
    expect(dossier.v).toBe(2);
    expect(typeof dossier.exportedAt).toBe('string');
    expect(dossier.lessons['module-1'].lessons.intro).toBe(true);
    expect(dossier.exams?.score).toBe(9);
    expect(dossier.certName).toBe('Operative Vega');
    expect(dossier.guideChecks.phishing.score).toBe(3);
    expect(dossier.guideChecks.phishing.bestOf).toBe(3);

    // Wipe storage, then re-import the dossier object.
    storage.clear();
    const res = mod.importProgress(dossier);
    expect(res.ok).toBe(true);

    expect(mod.getCompletedLessons('module-1').sort()).toEqual(['intro', 'recap']);
    expect(JSON.parse(storage.getItem(EXAM_KEY) as string).score).toBe(9);
    expect(storage.getItem(CERT_NAME_KEY)).toBe('Operative Vega');
    expect(mod.getGuideCheck('phishing')?.score).toBe(3);
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

  it('rejects downgrade (v:0) and unknown-future (v:3) dossier versions', async () => {
    const mod = await loadModule();
    const base = { exportedAt: 'x', lessons: { m: { lessons: { a: true } } }, exams: null, certName: null };

    const v0 = mod.importProgress({ ...base, v: 0 });
    expect(v0.ok).toBe(false);

    const v3 = mod.importProgress({ ...base, v: 3 });
    expect(v3.ok).toBe(false);

    // Nothing was written.
    expect(storage.getItem(PROGRESS_KEY)).toBe(null);
  });

  it('imports a v:1 dossier (no guideChecks field) cleanly — forward compatible', async () => {
    const mod = await loadModule();
    const legacy = {
      v: 1,
      exportedAt: 'x',
      lessons: { 'module-1': { lessons: { intro: true } } },
      exams: { passed: true, score: 8, total: 10, passedAt: '2026-01-01T00:00:00.000Z' },
      certName: 'Legacy Operative',
      // NOTE: deliberately no `guideChecks` — this is a v4 export.
    };
    const res = mod.importProgress(legacy);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addedLessons).toBe(1);
      expect(res.improvedGuideChecks).toBe(0);
    }
    expect(mod.isLessonComplete('module-1', 'intro')).toBe(true);
    // Missing field is treated as empty, not an error.
    expect(mod.getGuideCheck('phishing')).toBe(null);
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

  it('best-of merges imported guide checks by slug (better ratio wins, worse ignored)', async () => {
    const mod = await loadModule();
    // Existing: phishing solid, fake-online-stores weak.
    seedGuideChecks({
      phishing: { score: 3, bestOf: 3 },
      'fake-online-stores': { score: 1, bestOf: 3 },
    });

    const res = mod.importProgress({
      v: 2,
      exportedAt: 'x',
      lessons: {},
      exams: null,
      certName: null,
      guideChecks: {
        // worse than stored → ignored
        phishing: { score: 1, bestOf: 3, at: '2026-02-02T00:00:00.000Z' },
        // better than stored → wins
        'fake-online-stores': { score: 3, bestOf: 3, at: '2026-02-02T00:00:00.000Z' },
        // brand-new slug → added
        'nigerian-letters': { score: 2, bestOf: 3, at: '2026-02-02T00:00:00.000Z' },
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.improvedGuideChecks).toBe(2); // fake-online-stores + nigerian-letters

    expect(mod.getGuideCheck('phishing')?.score).toBe(3); // unchanged (best kept)
    expect(mod.getGuideCheck('fake-online-stores')?.score).toBe(3); // upgraded
    expect(mod.getGuideCheck('nigerian-letters')?.score).toBe(2); // added
  });

  it('skips corrupted imported guide-check entries without throwing', async () => {
    const mod = await loadModule();
    const res = mod.importProgress({
      v: 2,
      exportedAt: 'x',
      lessons: {},
      exams: null,
      certName: null,
      guideChecks: {
        good: { score: 2, bestOf: 3, at: 'x' },
        bad1: { score: 'nope' } as unknown as { score: number; bestOf: number },
        bad2: null as unknown as { score: number; bestOf: number },
        bad3: { score: 2, bestOf: 0, at: 'x' }, // bestOf 0 → skipped (guard)
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.improvedGuideChecks).toBe(1);
    expect(mod.getGuideCheck('good')?.score).toBe(2);
    expect(mod.getGuideCheck('bad1')).toBe(null);
    expect(mod.getGuideCheck('bad3')).toBe(null);
  });

  it('rejects a malformed guideChecks field (array) without mutating storage', async () => {
    const mod = await loadModule();
    seedGuideChecks({ phishing: { score: 3, bestOf: 3 } });
    const before = storage.getItem(GUIDE_CHECKS_KEY);
    const res = mod.importProgress({
      v: 2,
      exportedAt: 'x',
      lessons: {},
      exams: null,
      certName: null,
      guideChecks: [] as unknown as Record<string, never>,
    });
    expect(res.ok).toBe(false);
    expect(storage.getItem(GUIDE_CHECKS_KEY)).toBe(before);
  });
});

describe('recordGuideCheck (best-of by slug)', () => {
  it('stores a first result with an ISO timestamp', async () => {
    const mod = await loadModule();
    mod.recordGuideCheck('phishing', 2, 3);
    const rec = mod.getGuideCheck('phishing');
    expect(rec?.score).toBe(2);
    expect(rec?.bestOf).toBe(3);
    expect(typeof rec?.at).toBe('string');
    expect(Number.isNaN(Date.parse(rec!.at))).toBe(false);
    expect(dispatched).toContain('discammer:guidechecks');
  });

  it('keeps the better score when a worse retake is recorded', async () => {
    const mod = await loadModule();
    mod.recordGuideCheck('phishing', 3, 3); // perfect first
    mod.recordGuideCheck('phishing', 1, 3); // worse retake
    expect(mod.getGuideCheck('phishing')?.score).toBe(3);
  });

  it('upgrades when a strictly-better retake is recorded', async () => {
    const mod = await loadModule();
    mod.recordGuideCheck('phishing', 1, 3);
    mod.recordGuideCheck('phishing', 3, 3);
    expect(mod.getGuideCheck('phishing')?.score).toBe(3);
  });

  it('tracks each slug independently', async () => {
    const mod = await loadModule();
    mod.recordGuideCheck('phishing', 3, 3);
    mod.recordGuideCheck('nigerian-letters', 2, 4);
    expect(mod.getGuideCheck('phishing')?.score).toBe(3);
    expect(mod.getGuideCheck('nigerian-letters')?.score).toBe(2);
    expect(mod.getGuideCheck('nigerian-letters')?.bestOf).toBe(4);
  });

  it('ignores a bestOf of 0 (guard)', async () => {
    const mod = await loadModule();
    mod.recordGuideCheck('phishing', 0, 0);
    expect(mod.getGuideCheck('phishing')).toBe(null);
  });
});
