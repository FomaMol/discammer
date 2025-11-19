/** Narrow first-party adapter for Umami's documented /api/send endpoint.
 * No remote scripts, autocapture, form reading, URL query/hash, session replay,
 * cookies, persistent visitor IDs, or progress/sync data. Failures are silent.
 */
export interface AnalyticsConfig {
  websiteId: string;
  endpoint: string;
  hostname: string;
  url: string;
  surface: string;
  language: 'en' | 'ru';
}

const ENDPOINT = 'https://cloud.umami.is/api/send';
const OPT_OUT = 'discammer.analytics.disabled';
const SURFACES = new Set(['home', 'journal', 'article', 'guide', 'course', 'module', 'lesson', 'game', 'about', 'portfolio', 'check', 'inspect', 'search']);
const EVENTS = new Set(['page_viewed', 'home_view', 'portfolio_view', 'game_view', 'course_view', 'lesson_view', 'page_engaged', 'game_launch', 'lesson_complete']);
let stopped = false;

export function safeReferrer(raw: string, hostname: string): string {
  try {
    const ref = new URL(raw);
    if (!['http:', 'https:'].includes(ref.protocol) || ref.hostname === hostname) return '';
    return ref.origin; // strip credentials, path, query, hash
  } catch { return ''; }
}

function config(): AnalyticsConfig | null {
  try {
    const value = window.__DISCAMMER_CONFIG__?.analytics;
    if (!value || value.endpoint !== ENDPOINT || !/^[0-9a-f-]{36}$/i.test(value.websiteId)) return null;
    if (location.hostname !== value.hostname || !SURFACES.has(value.surface)) return null;
    if (!/^\/(en|ru)(?:\/[a-z0-9-]+){0,3}\/?$/.test(value.url)) return null;
    if (!['en', 'ru'].includes(value.language)) return null;
    return value;
  } catch { return null; }
}

function disabled(): boolean {
  try {
    if (stopped || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl || navigator.webdriver) return true;
    return localStorage.getItem(OPT_OUT) === '1';
  } catch { return true; } // no storage access: take the privacy-preserving default
}

/** The caller may select an event, but cannot attach arbitrary data. */
export function trackEvent(name?: string): void {
  try {
    const cfg = config();
    if (!cfg || disabled() || (name !== undefined && !EVENTS.has(name))) return;
    if (name === 'game_launch' && cfg.surface !== 'game') return;
    if (name === 'lesson_complete' && cfg.surface !== 'lesson') return;
    const payload = {
      website: cfg.websiteId, hostname: cfg.hostname, url: cfg.url,
      title: cfg.surface, language: cfg.language,
      screen: `${screen.width}x${screen.height}`,
      referrer: safeReferrer(document.referrer, cfg.hostname),
      ...(name ? { name, data: { surface: cfg.surface, language: cfg.language } } : {}),
    };
    void fetch(ENDPOINT, {
      method: 'POST', body: JSON.stringify({ type: 'event', payload }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
    }).catch(() => {});
  } catch { /* Analytics must never affect the product. */ }
}

export function initAnalytics(): void {
  const cfg = config();
  if (!cfg) return;
  const status = document.querySelector<HTMLElement>('[data-analytics-status]');
  const optOut = () => {
    stopped = true;
    try { localStorage.setItem(OPT_OUT, '1'); } catch { /* this page still stops */ }
    if (status) status.textContent = status.dataset.disabledMessage || '';
  };
  if (new URLSearchParams(location.search).get('analytics') === 'off') optOut();
  if (disabled() && status) status.textContent = status.dataset.disabledMessage || '';
  document.querySelector('[data-analytics-opt-out]')?.addEventListener('click', e => { e.preventDefault(); optOut(); });
  if (disabled()) return;

  let viewed = false;
  let interacted = false;
  let visibleMs = 0;
  let last = performance.now();
  let wasVisible = document.visibilityState === 'visible';
  const view = () => {
    if (viewed || document.visibilityState !== 'visible') return;
    viewed = true;
    trackEvent();
    trackEvent('page_viewed');
    const event = `${cfg.surface}_view`;
    if (EVENTS.has(event)) trackEvent(event);
  };
  const onInteraction = (e: Event) => { if (e.isTrusted) interacted = true; };
  for (const name of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(name, onInteraction, { passive: true });
  const accountTime = () => {
    const now = performance.now();
    // Cap suspended timer gaps so sleep/OS backgrounding cannot count as reading.
    if (wasVisible) visibleMs += Math.min(now - last, 1500);
    last = now;
    wasVisible = document.visibilityState === 'visible';
  };
  const onVisibility = () => { accountTime(); view(); };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(() => {
    accountTime();
    if (disabled()) { cleanup(); return; }
    if (viewed && interacted && visibleMs >= 30_000) {
      trackEvent('page_engaged');
      cleanup();
    }
  }, 1000);
  const cleanup = () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    for (const name of ['pointerdown', 'keydown', 'scroll']) document.removeEventListener(name, onInteraction);
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  view();
}
