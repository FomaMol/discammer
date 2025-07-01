/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// The worker's own source, inlined by Vite's `?raw`. Node's fs would need
// @types/node, which UX-4's no-new-dependency rule forbids; `?raw` is the
// idiom already available here and pins the real shipped file either way.
import swTemplate from '../../sw-src.js?raw';

/**
 * UX-4 · the service worker must never serve /api/sync/* from a cache.
 *
 * `sw-src.js` already bypasses the whole of `/api/` (rule 3 in its header), and
 * that bypass is STRONGER than network-first: the worker declines to call
 * respondWith at all, so the request leaves the page untouched and no cache
 * layer of ours can ever answer it. UX-4 therefore adds no new routing rule —
 * duplicating one would only create a second place to get it wrong. What was
 * missing is a test, so this file pins the existing guarantee for sync
 * specifically.
 *
 * Why it matters here more than for the rest of /api/: a cached `pull` would
 * hand a device stale course progress and silently lose whatever it learned
 * since; a cached `push`/`delete` would make an erase look like it worked when
 * the blob is still on the server.
 *
 * The worker is a build-time TEMPLATE evaluated as a plain script, not a
 * module, so it is loaded the way vite-plugin-sw.ts builds it — placeholders
 * substituted — and run with its globals injected as function parameters. That
 * exercises the shipped routing source itself rather than a paraphrase of it.
 */

const ORIGIN = 'https://discammer.example';

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: { get(name: string): string | null };
}

/** Records every cache touch so a test can prove the cache was never consulted. */
function makeCaches() {
  const touches: string[] = [];
  const cache = {
    match: async () => {
      touches.push('cache.match');
      return undefined;
    },
    put: async () => {
      touches.push('cache.put');
    },
    add: async () => {
      touches.push('cache.add');
    },
  };
  return {
    touches,
    caches: {
      open: async () => {
        touches.push('caches.open');
        return cache;
      },
      match: async () => {
        touches.push('caches.match');
        return undefined;
      },
      keys: async () => [],
      delete: async () => true,
    },
  };
}

/**
 * Evaluate sw-src.js with fake globals and hand back its `fetch` listener.
 * `new Function` (not import) because the worker is a script that registers
 * listeners on `self` and exports nothing.
 */
function loadFetchHandler(caches: unknown) {
  // split/join rather than replaceAll (not in this project's ES2020 lib) and
  // rather than replace(/../g) (whose replacement string treats `$` specially).
  const source = swTemplate
    .split('__SW_VERSION__')
    .join('test-version')
    .split('__PRECACHE_URLS__')
    .join(JSON.stringify([]))
    .split('__OFFLINE_URL__')
    .join('/static/offline.html');

  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, cb: (event: unknown) => void) => listeners.set(type, cb),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  // The worker's free variables, injected rather than stubbed onto globalThis,
  // so nothing leaks between tests.
  const run = new Function('self', 'caches', 'fetch', 'Request', 'Response', source);
  run(self, caches, async () => new Response('network'), Request, Response);

  const handler = listeners.get('fetch');
  if (!handler) throw new Error('sw-src.js registered no fetch listener');
  return handler;
}

function request(
  path: string,
  { method = 'GET', accept = '', mode = 'no-cors', destination = '' } = {},
): FakeRequest {
  return {
    url: `${ORIGIN}${path}`,
    method,
    mode,
    destination,
    headers: { get: (name) => (name.toLowerCase() === 'accept' ? accept : null) },
  };
}

/** Dispatch a fetch event; returns true if the worker intercepted the request. */
function intercepts(handler: (event: unknown) => void, req: FakeRequest): boolean {
  let intercepted = false;
  handler({
    request: req,
    respondWith: (promise: Promise<unknown>) => {
      intercepted = true;
      // Never leave a rejected promise dangling — the worker's branches fetch.
      void Promise.resolve(promise).catch(() => {});
    },
  });
  return intercepted;
}

describe('service worker · /api/sync/* is never cached', () => {
  it('DOES intercept a hashed static asset', () => {
    // Control. Without this, every assertion below could pass because the
    // harness is broken rather than because the worker bypasses sync. This is
    // the test that proves the others are capable of failing.
    const handler = loadFetchHandler(makeCaches().caches);
    expect(intercepts(handler, request('/static/js/main-abc123.js'))).toBe(true);
  });

  it('does not intercept GET /api/sync/pull', async () => {
    // The load-bearing case. A POST would prove nothing: the worker returns
    // early on `method !== 'GET'`, so a POST-only test would stay green even if
    // the /api/ bypass were deleted. A GET reaches the routing table for real,
    // and without the bypass would fall through to stale-while-revalidate.
    const { caches, touches } = makeCaches();
    const handler = loadFetchHandler(caches);

    expect(intercepts(handler, request('/api/sync/pull'))).toBe(false);

    await Promise.resolve();
    expect(touches).toEqual([]);
  });

  it('does not intercept GET /api/sync/pull even when it looks like a document', async () => {
    // An HTML Accept header steers requests into networkFirstPage, which caches
    // 200s into PAGES_CACHE as an offline fallback. Sync must not reach it.
    const { caches, touches } = makeCaches();
    const handler = loadFetchHandler(caches);

    expect(intercepts(handler, request('/api/sync/pull', { accept: 'text/html' }))).toBe(false);

    await Promise.resolve();
    expect(touches).toEqual([]);
  });

  it('does not intercept the POST calls sync actually makes', () => {
    // Real sync traffic. Belt-and-braces: two independent rules (method and
    // path prefix) each already exclude these.
    const handler = loadFetchHandler(makeCaches().caches);
    for (const path of ['/api/sync/push', '/api/sync/pull', '/api/sync/delete']) {
      expect(intercepts(handler, request(path, { method: 'POST' }))).toBe(false);
    }
  });
});
