import { describe, expect, it } from 'vitest';
import { inspect, URL_HEURISTICS, type UrlFinding } from './url_heuristics';

/** Ids fired for a given URL. */
function findingIds(url: string): string[] {
  return inspect(url).findings.map((f) => f.id);
}

describe('rule pack integrity', () => {
  it('has a reasonable number of heuristics with unique ids', () => {
    expect(URL_HEURISTICS.length).toBeGreaterThanOrEqual(10);
    const ids = URL_HEURISTICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every heuristic has an explainKey and a valid severity', () => {
    for (const r of URL_HEURISTICS) {
      expect(r.explainKey).toBeTruthy();
      expect([1, 2, 3]).toContain(r.severity);
    }
  });

  it('every guideSlug points at a seeded guide slug', () => {
    const SEEDED = new Set([
      'phishing',
      'nigerian-letters',
      'get-rich-quick-schemes',
      'investment-pyramids',
      'false-charities',
      'fake-online-stores',
      'abuse-on-dating-sites',
      'sms-and-phone-scams',
      'fraud-with-lotteries',
      'scam-sites-working-at-home',
    ]);
    for (const r of inspect('https://example.com').findings) {
      // no findings expected here, but keep the structural guard meaningful
      if (r.guideSlug) expect(SEEDED.has(r.guideSlug)).toBe(true);
    }
    for (const r of URL_HEURISTICS) {
      const slug = r.guideSlug;
      if (slug) expect(SEEDED.has(slug)).toBe(true);
    }
  });
});

describe('robust parsing / never throws', () => {
  it('empty input fires nothing and reads level 0', () => {
    const res = inspect('');
    expect(res.findings).toEqual([]);
    expect(res.level).toBe(0);
    expect(res.score).toBe(0);
  });

  it('whitespace-only input fires nothing', () => {
    expect(inspect('   \n\t  ').level).toBe(0);
  });

  it('does not throw on garbage input', () => {
    const junk = ['@@@', 'http://', '://///', 'не ссылка вовсе', '....', 'http://[', '%%%%', ')(*&^'];
    for (const g of junk) {
      expect(() => inspect(g)).not.toThrow();
    }
  });

  it('a scheme-less input still parses (host extracted)', () => {
    // "evil.com/login" has no scheme — the parser should prepend one to read
    // the host rather than bail. Non-HTTPS must still fire on the original.
    const res = inspect('evil.com/login');
    expect(res).toBeTruthy();
    expect(findingIds('evil.com/login')).toContain('not_https');
  });

  it('a clean https url fires nothing', () => {
    expect(findingIds('https://discammer.com')).toEqual([]);
    expect(findingIds('https://discammer.com/guide/phishing')).toEqual([]);
  });
});

describe('punycode / xn-- detection', () => {
  it('an xn-- host fires the punycode finding', () => {
    expect(findingIds('https://xn--80ak6aa92e.com/login')).toContain('punycode');
  });

  it('a normal host does not fire punycode', () => {
    expect(findingIds('https://example.com/login')).not.toContain('punycode');
  });
});

describe('mixed-script / homograph host detection', () => {
  it('a Latin/Cyrillic mixed host fires the homograph finding', () => {
    // "раypal.com" — "ра" are Cyrillic, fused with Latin "ypal".
    expect(findingIds('https://раypal.com/account')).toContain('homograph');
  });

  it('a pure-Latin host does not fire homograph', () => {
    expect(findingIds('https://paypal.com/account')).not.toContain('homograph');
  });
});

describe('IP-literal host detection', () => {
  it('an IPv4-literal host fires the ip_host finding', () => {
    expect(findingIds('http://192.168.10.5/login')).toContain('ip_host');
  });

  it('a normal host does not fire ip_host', () => {
    expect(findingIds('https://example.com')).not.toContain('ip_host');
  });
});

describe('userinfo @-trick detection', () => {
  it('a host with userinfo before @ fires the userinfo_trick finding', () => {
    // The real host is evil.ru; "bank.com" is just userinfo.
    expect(findingIds('http://bank.com@evil.ru/login')).toContain('userinfo_trick');
  });

  it('a plain url without @ does not fire userinfo_trick', () => {
    expect(findingIds('https://bank.com/login')).not.toContain('userinfo_trick');
  });
});

describe('deceptive / excessive subdomain detection', () => {
  it('a brand-in-subdomain deceptive host fires deceptive_subdomain', () => {
    // The registrable domain is secure-login.ru; paypal.com is a fake prefix.
    expect(findingIds('http://paypal.com.secure-login.ru/account')).toContain('deceptive_subdomain');
  });

  it('a normal two-label host does not fire deceptive_subdomain', () => {
    expect(findingIds('https://paypal.com/account')).not.toContain('deceptive_subdomain');
  });
});

describe('suspicious TLD detection', () => {
  it('a host on a high-abuse TLD fires suspicious_tld', () => {
    expect(findingIds('https://login-update.zip/verify')).toContain('suspicious_tld');
  });

  it('a host on a common TLD does not fire suspicious_tld', () => {
    expect(findingIds('https://example.com')).not.toContain('suspicious_tld');
  });
});

describe('url shortener detection', () => {
  it('a bit.ly host fires the shortener finding', () => {
    expect(findingIds('https://bit.ly/3xYz')).toContain('shortener');
  });

  it('a regular domain does not fire shortener', () => {
    expect(findingIds('https://example.com/3xYz')).not.toContain('shortener');
  });
});

describe('non-HTTPS detection', () => {
  it('an http url fires not_https', () => {
    expect(findingIds('http://example.com')).toContain('not_https');
  });

  it('an https url does not fire not_https', () => {
    expect(findingIds('https://example.com')).not.toContain('not_https');
  });
});

describe('port oddity detection', () => {
  it('an unusual explicit port fires port_oddity', () => {
    expect(findingIds('http://example.com:8080/login')).toContain('port_oddity');
  });

  it('a default port (or none) does not fire port_oddity', () => {
    expect(findingIds('https://example.com')).not.toContain('port_oddity');
    expect(findingIds('https://example.com:443')).not.toContain('port_oddity');
  });
});

describe('brand-lookalike detection', () => {
  it('a typosquatted brand host fires brand_lookalike', () => {
    // "paypa1" with a digit 1 standing in for the final l.
    const ids = findingIds('https://paypa1.com/login');
    expect(ids).toContain('brand_lookalike');
  });

  it('the genuine brand domain does not fire brand_lookalike', () => {
    expect(findingIds('https://paypal.com/login')).not.toContain('brand_lookalike');
  });
});

describe('overlong / obfuscated path detection', () => {
  it('a very long obfuscated path fires obfuscated_path', () => {
    const long =
      'https://example.com/' + 'a'.repeat(160) + '?token=' + 'x'.repeat(80);
    expect(findingIds(long)).toContain('obfuscated_path');
  });

  it('a short normal path does not fire obfuscated_path', () => {
    expect(findingIds('https://example.com/guide/phishing')).not.toContain('obfuscated_path');
  });
});

describe('scoring → level mapping', () => {
  it('a single soft (severity-1) finding reads a low level', () => {
    const res = inspect('https://bit.ly/3xYz');
    expect(res.findings.map((f) => f.id)).toContain('shortener');
    expect(res.level).toBeGreaterThanOrEqual(1);
    expect(res.level).toBeLessThanOrEqual(2);
  });

  it('a stacked malicious url saturates near the top of the meter', () => {
    // http (not_https) + @-trick + ip host.
    const res = inspect('http://bank.com@192.168.0.1:8080/login');
    expect(res.level).toBeGreaterThanOrEqual(4);
  });

  it('level never exceeds 5', () => {
    const res = inspect('http://paypal.com@192.168.0.1:8080/xn--evil/' + 'a'.repeat(200));
    expect(res.level).toBe(5);
  });
});

describe('inspection is a pure read', () => {
  it('does not mutate the input string', () => {
    const input = 'http://bank.com@evil.ru/login';
    const copy = input;
    inspect(input);
    expect(input).toBe(copy);
  });

  it('findings are typed UrlFinding objects with stable ids', () => {
    const findings: UrlFinding[] = inspect('http://bank.com@evil.ru/login').findings;
    expect(findings.every((f) => typeof f.id === 'string')).toBe(true);
  });
});
