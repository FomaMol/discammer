/**
 * URL/link heuristic pack for the link inspector (Task F2).
 *
 * Everything here is a pure, side-effect-free read. There is NO network call,
 * NO logging, NO analytics. The URL the user pastes is parsed and matched
 * entirely in the browser and never leaves the page. Keep it that way.
 *
 * This deepens what redflags.ts only touched (punycode + mixed-script): it
 * dissects a single pasted URL into named tells — punycode IDN, Latin/Cyrillic
 * homograph host, IP-literal host, the userinfo `@`-trick, deceptive/excessive
 * sub-domains, a high-abuse TLD set, raw URL shorteners, non-HTTPS, odd ports,
 * brand lookalikes, and an overlong/obfuscated path.
 *
 * Each finding carries an i18n `explainKey` (resolved under
 * `client.inspect.explain.*`) rather than human-readable copy, so the label +
 * explanation are authored per locale in backend/locales/{en,ru}.json.
 * `guideSlug`, when present, points at a seeded threat-guide slug (almost always
 * `phishing`) so a fired finding can link to the matching dossier.
 *
 * Severity scale:
 *   3 = strong deception on its own (homograph host, `@`-trick, deceptive
 *       brand sub-domain, IP-literal host, punycode)
 *   2 = suspicious in context (suspicious TLD, brand lookalike, odd port)
 *   1 = softer, easily-innocent signals (a bare shortener, non-HTTPS, a long
 *       obfuscated path)
 */

export type UrlFinding = {
  /** Stable id used by tests and React keys. Never localized. */
  id: string;
  severity: 1 | 2 | 3;
  /** i18n key under `client.inspect.explain.*`. */
  explainKey: string;
  /** Optional seeded guide slug to link the reader to the matching dossier. */
  guideSlug?: string;
};

/**
 * What we managed to parse out of the pasted string. Every field is best-effort
 * and tolerant of garbage — nothing here throws.
 */
export type ParsedUrl = {
  /** The original, untouched input. */
  raw: string;
  /** Lowercased hostname, or '' if none could be read. */
  host: string;
  /**
   * The host EXACTLY as typed in the original input, before the `URL`
   * constructor normalizes an IDN to punycode. A mixed-script host like
   * `раypal.com` survives here for the homograph check (the normalized `host`
   * would already be `xn--…`).
   */
  rawHost: string;
  /** Scheme of the ORIGINAL input ('http', 'https', '' if none was typed). */
  scheme: string;
  /** Userinfo segment before an '@' in the authority, or '' if none. */
  userinfo: string;
  /** Explicit port as typed, or '' if none. */
  port: string;
  /** Path + query + fragment as one string for length/obfuscation checks. */
  rest: string;
  /** True when the host is a bare IPv4/IPv6 literal. */
  isIpHost: boolean;
};

// ---------------------------------------------------------------------------
// Parsing — defensive, never throws
// ---------------------------------------------------------------------------

const IPV4_RE = /^(\d{1,3})(\.\d{1,3}){3}$/;

/** A host that is a bare IP literal (IPv4 dotted-quad or bracketed IPv6). */
function looksLikeIp(host: string): boolean {
  if (!host) return false;
  if (host.startsWith('[') && host.endsWith(']')) return true; // [::1] IPv6
  if (IPV4_RE.test(host)) {
    return host.split('.').every((oct) => Number(oct) <= 255);
  }
  return false;
}

/**
 * Read the ORIGINAL scheme the user typed (before we prepend one to parse).
 * Returns '' when the input is scheme-less. Only recognises a HIERARCHICAL
 * scheme — one followed by `://` (http, https, ftp…). An OPAQUE scheme like
 * `mailto:` or `tel:` (no `//`) is intentionally NOT matched here so the parser
 * still prepends `http://` for the scheme-less host path; the opaque case is
 * caught separately by `isOpaqueScheme`.
 */
function originalScheme(input: string): string {
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(input.trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * An OPAQUE (non-hierarchical) URI: a `scheme:` that is NOT followed by `//`,
 * e.g. `mailto:user@bank.com`, `tel:+15551234`, `sip:bob@example.com`. These
 * carry no authority component, so the part after the colon is NOT a host /
 * userinfo / port — feeding them through `http://…` would make the `URL` ctor
 * misread `mailto` as a username and `bank.com` as a host, falsely tripping
 * `userinfo_trick`, `port_oddity`, etc. We detect them so the parser can clear
 * those authority fields and the host-based heuristics simply can't fire.
 */
function isOpaqueScheme(input: string): boolean {
  const trimmed = input.trim();
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  );
}

/** Read the scheme name of an opaque URI (`mailto:` -> `mailto`), lowercased. */
function originalSchemeOpaque(input: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(input.trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * Extract the host substring EXACTLY as typed, before any IDN→punycode
 * normalization the `URL` constructor would apply. Strips an optional scheme,
 * any userinfo before `@`, and a trailing port/path/query/fragment. Lowercased.
 */
function rawHostOf(input: string, scheme: string): string {
  let work = input.trim();
  if (scheme) work = work.slice(scheme.length + 3); // strip "scheme://"
  const authEnd = work.search(/[/?#]/);
  let authority = authEnd === -1 ? work : work.slice(0, authEnd);
  const at = authority.lastIndexOf('@');
  if (at !== -1) authority = authority.slice(at + 1);
  let host = authority;
  if (!authority.startsWith('[')) {
    const colon = authority.lastIndexOf(':');
    if (colon !== -1) host = authority.slice(0, colon);
  }
  return host.toLowerCase();
}

/**
 * Parse the input defensively. Uses the `URL` constructor (prepending `http://`
 * when no scheme is present so the host is still extractable) inside try/catch.
 * On total failure it returns a best-effort empty parse rather than throwing.
 */
export function parseUrl(input: string): ParsedUrl {
  const raw = input ?? '';
  const trimmed = raw.trim();
  const scheme = originalScheme(trimmed);

  const empty: ParsedUrl = {
    raw,
    host: '',
    rawHost: '',
    scheme,
    userinfo: '',
    port: '',
    rest: '',
    isIpHost: false,
  };

  if (trimmed.length === 0) return empty;

  // Opaque URI (`mailto:`, `tel:`, `sip:`…): no authority component, so there is
  // no host/userinfo/port to judge. We return a parse with those fields cleared
  // and keep the typed scheme. CHOICE: an opaque URI yields NO findings at all —
  // a `mailto:`/`tel:` simply isn't a web link to inspect, and `not_https` is
  // gated on a non-empty host so a cleared host suppresses it too. This is the
  // cleanest way to avoid the false positives without ever throwing.
  if (isOpaqueScheme(trimmed)) {
    return { ...empty, scheme: originalSchemeOpaque(trimmed) };
  }

  const rawHost = rawHostOf(trimmed, scheme);

  // Prepend a scheme only to read the host; we keep the ORIGINAL scheme above
  // for the non-HTTPS check, so prepending here never masks an http:// input.
  const toParse = scheme ? trimmed : `http://${trimmed}`;

  try {
    const u = new URL(toParse);
    const host = (u.hostname || '').toLowerCase();
    return {
      raw,
      host,
      rawHost,
      scheme,
      userinfo: u.username || '',
      port: u.port || '',
      rest: `${u.pathname || ''}${u.search || ''}${u.hash || ''}`,
      isIpHost: looksLikeIp(host),
    };
  } catch {
    // URL() refused the input. Fall back to a hand-rolled best effort so we can
    // still flag e.g. a non-HTTPS scheme or a `@`-trick on otherwise-broken
    // input — but never throw.
    let work = trimmed;
    if (scheme) work = work.slice(scheme.length + 3); // strip "scheme://"
    // Authority is everything up to the first '/', '?' or '#'.
    const authEnd = work.search(/[/?#]/);
    const authority = authEnd === -1 ? work : work.slice(0, authEnd);
    const rest = authEnd === -1 ? '' : work.slice(authEnd);
    let userinfo = '';
    let hostport = authority;
    const at = authority.lastIndexOf('@');
    if (at !== -1) {
      userinfo = authority.slice(0, at);
      hostport = authority.slice(at + 1);
    }
    let host = hostport;
    let port = '';
    const colon = hostport.lastIndexOf(':');
    if (colon !== -1 && !hostport.startsWith('[')) {
      host = hostport.slice(0, colon);
      port = hostport.slice(colon + 1);
    }
    host = host.toLowerCase();
    return { raw, host, rawHost, scheme, userinfo, port, rest, isIpHost: looksLikeIp(host) };
  }
}

// ---------------------------------------------------------------------------
// Host / link tells (all pure)
// ---------------------------------------------------------------------------

const LATIN_RE = /[a-z]/i;
const CYRILLIC_RE = /[Ѐ-ӿ]/;
const GREEK_RE = /[Ͱ-Ͽ]/;

/**
 * Mixed-script host: a host whose letters mix Latin with Cyrillic (or Greek) —
 * the classic homograph trick (`раypal.com`). Scoped to the host so ordinary
 * bilingual paths or queries do NOT trip it.
 */
function hasMixedScriptHost(host: string): boolean {
  if (!host) return false;
  const letters = host.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return false;
  const latin = LATIN_RE.test(letters);
  const cyr = CYRILLIC_RE.test(letters);
  const grk = GREEK_RE.test(letters);
  // Fires when Latin coexists with a confusable non-Latin script in the host.
  return latin && (cyr || grk);
}

/**
 * Punycode IDN: an `xn--` label the user LITERALLY typed. We check the raw host
 * (and raw input) rather than the normalized host so a mixed-script host the
 * `URL` ctor auto-encoded to `xn--…` is reported as `homograph`, not punycode —
 * the user sees the tell that matches what they pasted.
 */
function hasPunycode(parsed: ParsedUrl): boolean {
  if (parsed.rawHost.split('.').some((label) => label.startsWith('xn--'))) return true;
  // Fall back to the raw input in case the xn-- label sits only in a malformed
  // path/userinfo we couldn't fully parse.
  return /(^|[./@])xn--[a-z0-9-]+/i.test(parsed.raw);
}

// A small, curated set of high-abuse / file-extension-collision TLDs. Kept
// short on purpose — this is a tell, not a blocklist.
const SUSPICIOUS_TLDS = new Set([
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
]);

function hasSuspiciousTld(host: string): boolean {
  if (!host || host.startsWith('[')) return false;
  const dot = host.lastIndexOf('.');
  if (dot === -1) return false;
  return SUSPICIOUS_TLDS.has(host.slice(dot + 1));
}

const SHORTENER_HOSTS = new Set([
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
]);

function isShortener(host: string): boolean {
  return SHORTENER_HOSTS.has(host);
}

/**
 * A deliberately small set of familiar labels attackers often embed after a
 * brand-shaped label. These are only literal labels in a host; they are NOT a
 * suffix resolver, a registrable-domain model, or an ownership lookup.
 */
const BRAND_LIKE_SUFFIX_LABELS = new Set(['com', 'net', 'org', 'ru', 'io', 'app', 'info', 'biz']);

/**
 * A narrow deceptive-label embedding: a known brand is immediately followed
 * by one of the literal labels above, and further labels remain — e.g.
 * `paypal.com.secure-login.ru`. It makes no claim about a registrable domain,
 * a public suffix, or who owns the host. Unknown patterns fail closed.
 */
const DECEPTIVE_BRAND_LABELS = [
  'paypal',
  'sberbank',
  'sber',
  'gosuslugi',
  'tinkoff',
  'apple',
  'google',
  'microsoft',
  'amazon',
  'alfabank',
  'vtb',
  'wildberries',
  'ozon',
  'whatsapp',
  'telegram',
];

function hasDeceptiveSubdomain(host: string): boolean {
  if (!host || host.startsWith('[') || looksLikeIp(host)) return false;
  const labels = host.split('.').filter(Boolean);
  for (let index = 0; index < labels.length - 2; index += 1) {
    if (
      DECEPTIVE_BRAND_LABELS.includes(labels[index]) &&
      BRAND_LIKE_SUFFIX_LABELS.has(labels[index + 1])
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Brand-lookalike (typosquat) — small curated list
// ---------------------------------------------------------------------------

const KNOWN_BRANDS = [
  'paypal',
  'sberbank',
  'gosuslugi',
  'tinkoff',
  'apple',
  'google',
  'microsoft',
  'amazon',
  'wildberries',
  'whatsapp',
  'telegram',
];

/** Levenshtein distance, capped — small strings only, so the naive DP is fine. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3; // early out — too far to matter
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Map common look-alike substitutions back to their plain letters so `paypa1`
 * (digit one) and `g00gle` (zeros) normalize toward the real brand before the
 * edit-distance compare.
 */
function deLeet(label: string): string {
  return label
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's');
}

/**
 * Brand lookalike: a candidate is immediately followed by one of the same
 * literal brand-like labels, either as a short host (`paypa1.com`) or embedded
 * in a longer host (`paypa1.com.evil.co.uk`). Unknown label patterns fail
 * closed. The exact brand label never fires; this does not resolve domains.
 */
function hasBrandLookalike(host: string): boolean {
  if (!host || host.startsWith('[') || looksLikeIp(host)) return false;
  const labels = host.split('.').filter(Boolean);
  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels[index];
    if (!BRAND_LIKE_SUFFIX_LABELS.has(labels[index + 1])) continue;
    if (KNOWN_BRANDS.includes(candidate)) continue;
    const norm = deLeet(candidate);
    if (KNOWN_BRANDS.includes(norm)) return true;
    for (const brand of KNOWN_BRANDS) {
      if (Math.abs(norm.length - brand.length) > 2) continue;
      const d = editDistance(norm, brand);
      if (d >= 1 && d <= 2) return true;
    }
  }
  return false;
}

// Common, expected ports that should NOT flag.
const OK_PORTS = new Set(['', '80', '443']);

function hasOddPort(port: string): boolean {
  return !OK_PORTS.has(port);
}

/** Overlong or obfuscated path/query — long, or heavy on encoded bytes. */
function hasObfuscatedPath(rest: string): boolean {
  if (!rest) return false;
  if (rest.length >= 100) return true;
  const encoded = (rest.match(/%[0-9a-f]{2}/gi) || []).length;
  return encoded >= 6;
}

// ---------------------------------------------------------------------------
// The heuristic pack
// ---------------------------------------------------------------------------

type UrlRule = UrlFinding & { test: (p: ParsedUrl) => boolean };

export const URL_HEURISTICS: UrlRule[] = [
  {
    id: 'punycode',
    severity: 3,
    explainKey: 'punycode',
    guideSlug: 'phishing',
    test: (p) => hasPunycode(p),
  },
  {
    id: 'homograph',
    severity: 3,
    explainKey: 'homograph',
    guideSlug: 'phishing',
    // Check the host AS TYPED — the `URL` ctor normalizes an IDN to punycode,
    // which would erase the Cyrillic/Latin mix this rule looks for.
    test: (p) => hasMixedScriptHost(p.rawHost),
  },
  {
    id: 'ip_host',
    severity: 3,
    explainKey: 'ip_host',
    guideSlug: 'phishing',
    test: (p) => p.isIpHost,
  },
  {
    id: 'userinfo_trick',
    severity: 3,
    explainKey: 'userinfo_trick',
    guideSlug: 'phishing',
    test: (p) => p.userinfo.length > 0,
  },
  {
    id: 'deceptive_subdomain',
    severity: 3,
    explainKey: 'deceptive_subdomain',
    guideSlug: 'phishing',
    test: (p) => hasDeceptiveSubdomain(p.host),
  },
  {
    id: 'brand_lookalike',
    severity: 2,
    explainKey: 'brand_lookalike',
    guideSlug: 'phishing',
    test: (p) => hasBrandLookalike(p.host),
  },
  {
    id: 'suspicious_tld',
    severity: 2,
    explainKey: 'suspicious_tld',
    guideSlug: 'fake-online-stores',
    test: (p) => hasSuspiciousTld(p.host),
  },
  {
    id: 'shortener',
    severity: 1,
    explainKey: 'shortener',
    test: (p) => isShortener(p.host),
  },
  {
    id: 'not_https',
    severity: 1,
    explainKey: 'not_https',
    guideSlug: 'phishing',
    // Fires when the ORIGINAL input was http:// or had no scheme at all (a
    // scheme-less paste is treated as non-HTTPS). An https:// input is clean.
    test: (p) => p.host.length > 0 && p.scheme !== 'https',
  },
  {
    id: 'port_oddity',
    severity: 2,
    explainKey: 'port_oddity',
    test: (p) => hasOddPort(p.port),
  },
  {
    id: 'obfuscated_path',
    severity: 1,
    explainKey: 'obfuscated_path',
    test: (p) => hasObfuscatedPath(p.rest),
  },
];

/** The stable id list — handy for tests and the SSR worked-example legend. */
export const URL_HEURISTIC_IDS = URL_HEURISTICS.map((r) => r.id);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type InspectionResult = {
  /** The parsed view (so the UI can echo the host it judged). */
  parsed: ParsedUrl;
  /** Findings that fired, in declaration order. */
  findings: UrlFinding[];
  /** Severity-weighted raw score (sum of fired severities). */
  score: number;
  /** Meter level 0..5 (0 = nothing fired / empty input). */
  level: 0 | 1 | 2 | 3 | 4 | 5;
};

/**
 * Map a severity-weighted score to a 0..5 meter level. Gentle at the low end (a
 * single soft tell shouldn't max the meter) and saturating once strong tells
 * stack.
 *
 *   score 0    -> 0
 *   score 1    -> 1
 *   score 2-3  -> 2
 *   score 4-5  -> 3
 *   score 6-8  -> 4
 *   score 9+   -> 5
 */
function scoreToLevel(score: number): InspectionResult['level'] {
  if (score <= 0) return 0;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  if (score <= 5) return 3;
  if (score <= 8) return 4;
  return 5;
}

/**
 * Pure inspection entry point. Parses the URL defensively and runs every
 * heuristic, returning the fired findings, a severity-weighted score, and a
 * 0..5 meter level. No network, no logging, no mutation of the input — the URL
 * never leaves the browser.
 */
export function inspect(url: string): InspectionResult {
  const raw = url ?? '';
  if (raw.trim().length === 0) {
    return { parsed: parseUrl(''), findings: [], score: 0, level: 0 };
  }

  const parsed = parseUrl(raw);

  const findings: UrlFinding[] = [];
  for (const rule of URL_HEURISTICS) {
    try {
      if (rule.test(parsed)) {
        const { test: _test, ...finding } = rule;
        findings.push(finding);
      }
    } catch {
      // A malformed input must never throw out of inspection — skip the rule.
    }
  }

  const score = findings.reduce((sum, f) => sum + f.severity, 0);
  return { parsed, findings, score, level: scoreToLevel(score) };
}
