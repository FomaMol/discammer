import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_SHORTENER_HOSTS,
  BUILTIN_SUSPICIOUS_TLDS,
  isShortenerHost,
  isSuspiciousTld,
  loadThreatRules,
  mergeThreatRules,
  resetThreatRules,
  resetThreatRulesLoader,
  shortenerHostList,
  suspiciousTldList,
} from './threat_feed';
import { analyze } from './redflags';
import { inspect } from './url_heuristics';

// Every test starts from the built-in seeds and a fresh loader guard so a merge
// in one test can never leak into another (the module state is shared).
afterEach(() => {
  resetThreatRules();
  resetThreatRulesLoader();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('built-in seeds (day-one behavior)', () => {
  it('the augmented sets start equal to the built-in lists', () => {
    expect(new Set(shortenerHostList())).toEqual(new Set(BUILTIN_SHORTENER_HOSTS));
    expect(new Set(suspiciousTldList())).toEqual(new Set(BUILTIN_SUSPICIOUS_TLDS));
  });

  it('a built-in shortener and TLD are recognized before any merge', () => {
    expect(isShortenerHost('bit.ly')).toBe(true);
    expect(isSuspiciousTld('zip')).toBe(true);
    expect(isShortenerHost('evil.link')).toBe(false); // not seeded
  });
});

describe('mergeThreatRules — set-union with the built-ins', () => {
  it('adds feed-only hosts/TLDs while keeping every built-in', () => {
    mergeThreatRules({
      version: '2099-01-01',
      shortener_hosts: ['snip.example', 'bit.ly'], // one new, one overlapping
      suspicious_tlds: ['quux'],
    });
    // New entries present.
    expect(isShortenerHost('snip.example')).toBe(true);
    expect(isSuspiciousTld('quux')).toBe(true);
    // Built-ins never dropped.
    for (const h of BUILTIN_SHORTENER_HOSTS) expect(isShortenerHost(h)).toBe(true);
    for (const t of BUILTIN_SUSPICIOUS_TLDS) expect(isSuspiciousTld(t)).toBe(true);
    // No duplication from the overlapping 'bit.ly'.
    expect(shortenerHostList().filter((h) => h === 'bit.ly')).toHaveLength(1);
  });

  it('normalizes case and whitespace on feed entries', () => {
    mergeThreatRules({ shortener_hosts: ['  SNIP.Example  '], suspicious_tlds: [' QUUX '] });
    expect(isShortenerHost('snip.example')).toBe(true);
    expect(isSuspiciousTld('quux')).toBe(true);
  });

  it('ignores malformed / hostile entries but leaves built-ins intact', () => {
    mergeThreatRules({
      shortener_hosts: [42, null, '', '  ', 'has space', 'ok.example', 'bad|regex', 'a.b(c)'],
      suspicious_tlds: [{}, 'under_score', 'good'],
    });
    // Only the shape-valid ones get in.
    expect(isShortenerHost('ok.example')).toBe(true);
    expect(isSuspiciousTld('good')).toBe(true);
    // Rejected shapes never entered.
    expect(isShortenerHost('has space')).toBe(false);
    expect(isShortenerHost('bad|regex')).toBe(false);
    expect(isShortenerHost('a.b(c)')).toBe(false);
    expect(isSuspiciousTld('under_score')).toBe(false);
    // Built-ins fully preserved (fallback guarantee).
    expect(new Set(BUILTIN_SHORTENER_HOSTS).size).toBeLessThanOrEqual(shortenerHostList().length);
    for (const h of BUILTIN_SHORTENER_HOSTS) expect(isShortenerHost(h)).toBe(true);
  });

  it('falls back to built-ins on completely garbage input (never throws)', () => {
    for (const junk of [null, undefined, 42, 'nope', [], { shortener_hosts: 'not-a-list' }]) {
      expect(() => mergeThreatRules(junk)).not.toThrow();
    }
    expect(new Set(shortenerHostList())).toEqual(new Set(BUILTIN_SHORTENER_HOSTS));
    expect(new Set(suspiciousTldList())).toEqual(new Set(BUILTIN_SUSPICIOUS_TLDS));
  });
});

describe('engines pick up feed-only signatures after merge', () => {
  it('the inspector detects a feed-only shortener host and TLD', () => {
    // Before merge: unknown to the engine.
    expect(inspect('https://snip.example/abc').findings.map((f) => f.id)).not.toContain(
      'shortener',
    );
    expect(inspect('https://login.quux/verify').findings.map((f) => f.id)).not.toContain(
      'suspicious_tld',
    );

    mergeThreatRules({ shortener_hosts: ['snip.example'], suspicious_tlds: ['quux'] });

    // After merge: detected — WITHOUT any code change to the engine.
    expect(inspect('https://snip.example/abc').findings.map((f) => f.id)).toContain('shortener');
    expect(inspect('https://login.quux/verify').findings.map((f) => f.id)).toContain(
      'suspicious_tld',
    );
  });

  it('the message analyzer detects a feed-only shortener host', () => {
    expect(analyze('Open snip.example/x now').fired.map((f) => f.id)).not.toContain(
      'url_shortener',
    );

    mergeThreatRules({ shortener_hosts: ['snip.example'] });

    expect(analyze('Open snip.example/x now').fired.map((f) => f.id)).toContain('url_shortener');
  });

  it('with NO feed merged, built-in engine behavior is unchanged', () => {
    // A built-in shortener still fires; an unlisted host still does not.
    expect(inspect('https://bit.ly/3xYz').findings.map((f) => f.id)).toContain('shortener');
    expect(inspect('https://snip.example/abc').findings.map((f) => f.id)).not.toContain(
      'shortener',
    );
    expect(analyze('Check https://bit.ly/3xYz').fired.map((f) => f.id)).toContain('url_shortener');
  });
});

describe('loadThreatRules — fetch once, offline fallback, no user data', () => {
  it('fetches /api/threat-rules with no body/credentials and merges the result', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            version: 'x',
            shortener_hosts: ['fromfeed.example'],
            suspicious_tlds: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await loadThreatRules();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    const init = fetchMock.mock.calls[0][1];
    expect(url).toBe('/api/threat-rules');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit' });
    // No body is ever sent — nothing the user typed can leave the device.
    expect(init?.body).toBeUndefined();
    expect(isShortenerHost('fromfeed.example')).toBe(true);
  });

  it('is a no-op on the second call (fetched at most once per session)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ version: 'x', shortener_hosts: [], suspicious_tlds: [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await loadThreatRules();
    await loadThreatRules();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the built-ins when the fetch rejects (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(loadThreatRules()).resolves.toBeUndefined(); // never throws
    expect(new Set(shortenerHostList())).toEqual(new Set(BUILTIN_SHORTENER_HOSTS));
    expect(new Set(suspiciousTldList())).toEqual(new Set(BUILTIN_SUSPICIOUS_TLDS));
  });

  it('keeps the built-ins on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    await loadThreatRules();
    expect(new Set(shortenerHostList())).toEqual(new Set(BUILTIN_SHORTENER_HOSTS));
  });

  it('keeps the built-ins on malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{ not json', { status: 200 })),
    );
    await loadThreatRules();
    expect(new Set(shortenerHostList())).toEqual(new Set(BUILTIN_SHORTENER_HOSTS));
    expect(new Set(suspiciousTldList())).toEqual(new Set(BUILTIN_SUSPICIOUS_TLDS));
  });
});
