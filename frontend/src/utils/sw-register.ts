/*
 * PERF-3 — service worker registration.
 *
 * Registration lives in a bundled module (called from main.tsx) rather than an
 * inline handler: the CSP is `script-src 'self' 'nonce-…'`, so an inline
 * registration snippet would be blocked, but the hashed entry bundle is
 * `'self'`.
 *
 * Contract:
 *   - No-op (never throws) where service workers are unsupported.
 *   - Registers `/sw.js` at root scope `/` so the worker controls navigations
 *     site-wide (the FastAPI route serves the file from the origin root).
 *   - Registration failures are swallowed with a warning — a failed SW must
 *     never break the page.
 */

const SW_URL = '/sw.js';
const SW_SCOPE = '/';

export function registerServiceWorker(): void {
  // Guard for SSR/unit contexts and unsupported browsers.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window === 'undefined') return;

  const register = () => {
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch((err) => {
      // Never surface as an uncaught rejection — the site must work without a SW.
      console.warn('[sw] registration failed', err);
    });
  };

  // Register after `load` so the worker install never competes with the
  // critical first paint. If the page has already loaded (islands mounted after
  // load), register immediately.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
