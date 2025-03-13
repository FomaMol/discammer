/**
 * UX-5 — updatable threat-rules feed (client side).
 *
 * The message analyzer (redflags.ts) and link inspector (url_heuristics.ts) run
 * their rule ENGINES entirely in the browser — pure functions, no network, no
 * user data ever leaves the page. Two of the signals those engines consult are
 * plain DATA lists rather than logic:
 *
 *   - SHORTENER_HOSTS   (URL-shortener domains; used by BOTH engines)
 *   - SUSPICIOUS_TLDS   (high-abuse top-level domains; used by the inspector)
 *
 * This module is the single source of truth for those two lists. It ships the
 * built-in seeds (the correct day-one behavior AND the permanent offline
 * fallback) and exposes MUTABLE augmented sets the engines read through. A tiny
 * loader fetches `/api/threat-rules` once and set-UNIONS any new hosts/TLDs in,
 * so the engines gain new signatures without a frontend redeploy.
 *
 * Hard privacy/safety rules this file keeps:
 *   - DATA ONLY. We never fetch or eval code — only string lists. Entries are
 *     validated to host/TLD shape (`[a-z0-9.-]`), so a feed value can never
 *     become a regex metacharacter or script.
 *   - The fetch sends NO user input (no body, no query text) and reads only a
 *     public, cacheable feed. It is the ONLY network call these tools make.
 *   - It NEVER throws and NEVER blocks analysis: offline, 4xx/5xx, or malformed
 *     JSON all leave the built-in lists exactly as they were.
 */

/** Built-in URL-shortener hosts — the seed and the offline fallback. */
export const BUILTIN_SHORTENER_HOSTS: readonly string[] = [
  'bit.ly',
  'tinyurl.com',
  'is.gd',
  't.co',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  'vk.cc',
  'clck.ru',
  't.me',
  'rb.gy',
  'tiny.cc',
];

/** Built-in high-abuse TLDs — the seed and the offline fallback. */
export const BUILTIN_SUSPICIOUS_TLDS: readonly string[] = [
  'zip',
  'mov',
  'top',
  'xyz',
  'gq',
  'ml',
  'cf',
  'tk',
  'ga',
  'work',
  'click',
  'link',
  'country',
  'kim',
  'loan',
  'rest',
  'fit',
  'cam',
];

// Only accept feed entries that look like a host / TLD label. This is the guard
// that keeps the redflags shortener regex (built from these strings) safe: no
// regex metacharacter, whitespace, or script can survive it.
const HOST_SHAPE = /^[a-z0-9.-]+$/;
const TLD_SHAPE = /^[a-z0-9-]+$/;

// Live augmented sets the engines consult. They START as the built-ins and only
// ever GROW (set-union) when a valid feed merges in — so behavior can never
// regress below the built-in lists, even with a bad or partial feed.
const shortenerHosts = new Set<string>(BUILTIN_SHORTENER_HOSTS);
const suspiciousTlds = new Set<string>(BUILTIN_SUSPICIOUS_TLDS);

/** True when `host` is a known URL-shortener domain (built-in ∪ feed). */
export function isShortenerHost(host: string): boolean {
  return shortenerHosts.has(host);
}

/** True when `tld` (the bare label, no dot) is a high-abuse TLD (built-in ∪ feed). */
export function isSuspiciousTld(tld: string): boolean {
  return suspiciousTlds.has(tld);
}

/** Snapshot of the current shortener hosts — used by the word-bounded matcher. */
export function shortenerHostList(): string[] {
  return Array.from(shortenerHosts);
}

/** Snapshot of the current suspicious TLDs. Handy for tests/introspection. */
export function suspiciousTldList(): string[] {
  return Array.from(suspiciousTlds);
}

/**
 * Merge a fetched (or otherwise supplied) feed into the augmented sets.
 * Tolerant of any shape: a non-object, missing keys, non-array values, or
 * non-string / wrong-shaped entries are simply ignored. Only the VALID
 * host/TLD-shaped strings are unioned in; the built-ins always remain. Never
 * throws.
 */
export function mergeThreatRules(feed: unknown): void {
  if (!feed || typeof feed !== 'object') return;
  const f = feed as { shortener_hosts?: unknown; suspicious_tlds?: unknown };

  if (Array.isArray(f.shortener_hosts)) {
    for (const raw of f.shortener_hosts) {
      if (typeof raw !== 'string') continue;
      const host = raw.trim().toLowerCase();
      if (host && HOST_SHAPE.test(host)) shortenerHosts.add(host);
    }
  }

  if (Array.isArray(f.suspicious_tlds)) {
    for (const raw of f.suspicious_tlds) {
      if (typeof raw !== 'string') continue;
      const tld = raw.trim().toLowerCase();
      if (tld && TLD_SHAPE.test(tld)) suspiciousTlds.add(tld);
    }
  }
}

/** Reset both sets to the built-in seeds. Exists for tests. */
export function resetThreatRules(): void {
  shortenerHosts.clear();
  for (const h of BUILTIN_SHORTENER_HOSTS) shortenerHosts.add(h);
  suspiciousTlds.clear();
  for (const t of BUILTIN_SUSPICIOUS_TLDS) suspiciousTlds.add(t);
}

// Session-level guards so the feed is fetched at most once (and retried on a
// later mount only if the previous attempt failed). Module state, not React
// state — the merged sets persist for the whole page session.
let succeeded = false;
let inflight: Promise<void> | null = null;

/**
 * Fetch `/api/threat-rules` once and merge it in. Fire-and-forget: callers do
 * NOT await it and analysis never depends on it. Sends no user data, no body,
 * no credentials. Any failure (offline, non-2xx, malformed JSON) is swallowed —
 * the built-in lists stay in force.
 */
export function loadThreatRules(): Promise<void> {
  if (succeeded) return Promise.resolve();
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/threat-rules', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        cache: 'default',
      });
      if (!res.ok) return;
      const data: unknown = await res.json();
      mergeThreatRules(data);
      succeeded = true;
    } catch {
      // Offline / blocked / malformed — keep the built-ins. Analysis already
      // works with them, so there is nothing to recover and nothing to log.
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Reset the fetch guards too. Exists for tests. */
export function resetThreatRulesLoader(): void {
  succeeded = false;
  inflight = null;
}
