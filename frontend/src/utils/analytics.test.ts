import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const websiteId = 'b8eb4c16-67f2-413f-a5c9-9c2647439e2e';
const settings = {
  websiteId, endpoint: 'https://cloud.umami.is/api/send', hostname: 'discammer.com',
  url: '/en/check', surface: 'check', language: 'en',
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { __DISCAMMER_CONFIG__: { analytics: { ...settings } } });
  vi.stubGlobal('location', { hostname: 'discammer.com', search: '?text=secret&email=private@example.com', hash: '#recovery-secret' });
  vi.stubGlobal('document', { title: 'secret search query', referrer: 'https://admissions.example.edu/reviewer/private?token=secret#password' });
  vi.stubGlobal('navigator', { doNotTrack: '0', webdriver: false });
  vi.stubGlobal('screen', { width: 1280, height: 800 });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bounded analytics payload', () => {
  it('removes private referrer data, document title and all current URL input', async () => {
    const { trackEvent } = await import('./analytics');
    trackEvent('page_engaged');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, request] = vi.mocked(fetch).mock.calls[0];
    expect(endpoint).toBe(settings.endpoint);
    expect(request).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true });
    const body = JSON.parse(request!.body as string);
    expect(body.payload).toMatchObject({ url: '/en/check', title: 'check', referrer: 'https://admissions.example.edu', name: 'page_engaged' });
    expect(request!.body).not.toMatch(/secret|private|password|token|email/);
    expect(Object.keys(body.payload).sort()).toEqual(['website', 'hostname', 'url', 'title', 'language', 'screen', 'referrer', 'name', 'data'].sort());
  });
  it('rejects arbitrary event names and events on the wrong page', async () => {
    const { trackEvent } = await import('./analytics');
    for (const name of ['secret', 'game_launch', 'lesson_complete']) trackEvent(name);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends a real pageview without an event name', async () => {
    (await import('./analytics')).trackEvent();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.payload.name).toBeUndefined();
    expect(body.payload.id).toBeUndefined();
  });
  it.each(['dnt', 'gpc', 'bot', 'optout', 'storage-denied', 'disabled', 'wrong-domain', 'bad-endpoint', 'bad-url'])('fails closed for %s', async kind => {
    if (kind === 'dnt') vi.stubGlobal('navigator', { doNotTrack: '1' });
    if (kind === 'gpc') vi.stubGlobal('navigator', { globalPrivacyControl: true });
    if (kind === 'bot') vi.stubGlobal('navigator', { webdriver: true });
    if (kind === 'optout') vi.stubGlobal('localStorage', { getItem: () => '1' });
    if (kind === 'storage-denied') vi.stubGlobal('localStorage', { getItem: () => { throw Error(); } });
    if (kind === 'disabled') window.__DISCAMMER_CONFIG__!.analytics = null;
    if (kind === 'wrong-domain') vi.stubGlobal('location', { hostname: 'localhost' });
    if (kind === 'bad-endpoint') window.__DISCAMMER_CONFIG__!.analytics!.endpoint = 'https://evil.example';
    if (kind === 'bad-url') window.__DISCAMMER_CONFIG__!.analytics!.url += '?secret=value';
    (await import('./analytics')).trackEvent();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never breaks a product action on transport errors', async () => {
    vi.mocked(fetch).mockRejectedValue(Error('blocked'));
    expect(() => import('./analytics').then(m => m.trackEvent('page_viewed'))).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it('drops invalid and same-site referrers', async () => {
    const { safeReferrer } = await import('./analytics');
    for (const ref of ['javascript:secret', '', 'not a url', 'https://discammer.com/check?private=yes']) expect(safeReferrer(ref, 'discammer.com')).toBe('');
    expect(safeReferrer('https://user:password@university.edu/private?secret=yes', 'discammer.com')).toBe('https://university.edu');
  });
});
