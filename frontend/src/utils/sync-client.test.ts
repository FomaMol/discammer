import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportProgress, markLessonComplete } from './progress';
import {
  clearLinkedCode,
  deleteRemote,
  loadLinkedCode,
  pullProgress,
  pushProgress,
  saveLinkedCode,
} from './sync-client';
import { deriveKeys, encodeCode, encryptDossier, generateSecret } from './sync-crypto';

/**
 * UX-4 · sync transport + link state.
 *
 * The suite runs in the `node` environment (vitest.config.ts), so — exactly as
 * progress.test.ts does — we stand up a minimal in-memory `localStorage` +
 * `window` before touching a module that reads them. Node 20 supplies
 * `crypto.subtle`, `btoa`/`atob` and `fetch`, so the real crypto runs here and
 * only `fetch` is stubbed: this file's job is the wire, not the cipher.
 *
 * The load-bearing assertions are the negative ones. The server is assumed
 * hostile, so what must NEVER appear on the wire (the code itself, plaintext
 * progress) is the contract worth pinning.
 */

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
  };
}

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  class FakeCustomEvent {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  }
  (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;
  (globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  (globalThis as Record<string, unknown>).localStorage = storage;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

/** A 204 with no body, as push/delete actually answer. */
const noContent = () => new Response(null, { status: 204 });

describe('link state', () => {
  it('persists and clears the linked code', () => {
    expect(loadLinkedCode()).toBeNull();
    saveLinkedCode('ABC');
    expect(loadLinkedCode()).toBe('ABC');
    clearLinkedCode();
    expect(loadLinkedCode()).toBeNull();
  });

  it('never puts the code inside the synced dossier', () => {
    // The code is the key. If it rode inside its own ciphertext, then anyone who
    // ever decrypted one blob would hold the code that opens every future one —
    // and "unlink this device" could never actually unlink anything.
    saveLinkedCode('SECRETCODE');
    expect(JSON.stringify(exportProgress())).not.toContain('SECRETCODE');
  });

  it('survives storage being unavailable rather than throwing', () => {
    // Safari private mode throws on setItem. Sync is a convenience; it must
    // degrade to "off" and never take the course page down with it.
    (globalThis as Record<string, unknown>).window = {
      get localStorage(): never {
        throw new Error('storage disabled');
      },
    };
    expect(() => saveLinkedCode('ABC')).not.toThrow();
    expect(loadLinkedCode()).toBeNull();
    expect(() => clearLinkedCode()).not.toThrow();
  });
});

describe('transport', () => {
  it('sends only blob_id and ciphertext — never plaintext progress', async () => {
    const fetchMock = vi.fn(async () => noContent());
    vi.stubGlobal('fetch', fetchMock);
    markLessonComplete('mod-1', 'lesson-1');

    const code = encodeCode(generateSecret());
    expect(await pushProgress(code)).toBe('ok');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sync/push');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['blob', 'blob_id']);
    expect(body.blob_id).toMatch(/^[0-9a-f]{64}$/);
    // The blob must be opaque: no dossier field names in the wire payload.
    expect(init.body).not.toContain('lessons');
    expect(init.body).not.toContain('certName');
    expect(init.body).not.toContain('lesson-1');
  });

  it('never sends the code itself, on any verb', async () => {
    // The single assertion the whole design rests on. blob_id is derived from
    // the code by HKDF and is safe to hand over; the code is not. A mutant that
    // "simplified" blob_id to the code would pass every other test here.
    const fetchMock = vi.fn(async () => noContent());
    vi.stubGlobal('fetch', fetchMock);

    const code = encodeCode(generateSecret());
    await pushProgress(code);
    await deleteRemote(code);
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }) as never);
    await pullProgress(code);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.body).not.toContain(code);
      // Nor may it hide in the URL, where nginx would log it.
      expect(url).not.toContain(code);
    }
  });

  it('rejects a malformed code without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await pullProgress('not-a-code')).toBe('bad-code');
    expect(await pushProgress('not-a-code')).toBe('error');
    expect(await deleteRemote('not-a-code')).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 404 to not-found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    expect(await pullProgress(encodeCode(generateSecret()))).toBe('not-found');
  });

  it('merges a pulled dossier into local progress', async () => {
    // The happy path, end to end through the real cipher: a blob encrypted under
    // this code must come back as merged progress, not merely a status string.
    const secret = generateSecret();
    const { encKey } = await deriveKeys(secret);
    const dossier = JSON.stringify({
      v: 2,
      exportedAt: '2026-07-15T00:00:00.000Z',
      lessons: { 'mod-9': { lessons: { 'lesson-from-server': true } } },
      exams: null,
      certName: null,
      guideChecks: {},
    });
    const blob = await encryptDossier(encKey, dossier);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ blob, updated_at: 'x' }), { status: 200 })),
    );

    expect(await pullProgress(encodeCode(secret))).toBe('ok');
    expect(exportProgress().lessons['mod-9'].lessons['lesson-from-server']).toBe(true);
  });

  it('reports bad-code when the blob will not decrypt under this code', async () => {
    // Wrong code and tampered blob are indistinguishable to us, and mean the
    // same thing to the user: this code does not open this data.
    const { encKey } = await deriveKeys(generateSecret());
    const blob = await encryptDossier(encKey, '{"v":2,"lessons":{}}');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ blob, updated_at: 'x' }), { status: 200 })),
    );
    expect(await pullProgress(encodeCode(generateSecret()))).toBe('bad-code');
  });

  it('reports error rather than throwing when the network is gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const code = encodeCode(generateSecret());
    expect(await pushProgress(code)).toBe('error');
    expect(await pullProgress(code)).toBe('error');
    expect(await deleteRemote(code)).toBe('error');
  });

  it('reports error on a rate-limited or failing server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
    const code = encodeCode(generateSecret());
    expect(await pushProgress(code)).toBe('error');
    expect(await pullProgress(code)).toBe('error');
    expect(await deleteRemote(code)).toBe('error');
  });

  it('deletes by blob_id alone', async () => {
    const fetchMock = vi.fn(async () => noContent());
    vi.stubGlobal('fetch', fetchMock);
    expect(await deleteRemote(encodeCode(generateSecret()))).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sync/delete');
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(['blob_id']);
  });

  it('sends no ambient credentials', async () => {
    // Same posture as the threat-feed fetch: these endpoints authenticate the
    // caller by knowledge of blob_id and nothing else, so a cookie riding along
    // could only ever link a blob to a session.
    const fetchMock = vi.fn(async () => noContent());
    vi.stubGlobal('fetch', fetchMock);
    await pushProgress(encodeCode(generateSecret()));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('omit');
  });
});
