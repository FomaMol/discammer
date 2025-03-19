import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerServiceWorker } from './sw-register';

/**
 * The vitest suite runs in the `node` environment, so `navigator`/`window` are
 * absent by default. Each test installs the minimal globals the util reads and
 * removes them afterwards, then asserts the registration contract:
 *   - no throw / no register when serviceWorker is unsupported;
 *   - registers `/sw.js` at scope `/` when supported;
 *   - defers to the `load` event when the document is still loading;
 *   - swallows a rejected registration (never an unhandled rejection).
 */

type LoadListener = () => void;

function installSupportedEnv(readyState: DocumentReadyState, register: ReturnType<typeof vi.fn>) {
  const loadListeners: LoadListener[] = [];
  vi.stubGlobal('navigator', { serviceWorker: { register } });
  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: LoadListener) => {
      if (type === 'load') loadListeners.push(cb);
    },
  });
  vi.stubGlobal('document', { readyState });
  return { loadListeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registerServiceWorker', () => {
  it('is a no-op when service workers are unsupported', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('document', { readyState: 'complete' });
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it('does not throw when navigator is entirely absent', () => {
    // navigator/window undefined (SSR-like) — must simply return.
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it('registers /sw.js at root scope immediately when the document is complete', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    installSupportedEnv('complete', register);

    registerServiceWorker();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('defers registration to the load event while the document is loading', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const { loadListeners } = installSupportedEnv('loading', register);

    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    expect(loadListeners).toHaveLength(1);

    // Fire the deferred load handler.
    loadListeners[0]();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('swallows a rejected registration without throwing', async () => {
    const register = vi.fn().mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installSupportedEnv('complete', register);

    expect(() => registerServiceWorker()).not.toThrow();
    // Let the rejected promise settle so the .catch runs.
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
  });
});
