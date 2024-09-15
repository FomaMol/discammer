import { type Page, type ConsoleMessage, expect } from '@playwright/test';

/**
 * Shared helpers for the DiScammer E2E harness.
 */

/** Every localized page surface, en + ru, used by the smoke sweep. */
export const PAGES: { path: string; label: string; island: string }[] = [
  { path: '/en/', label: 'home', island: 'HeroShader' },
  { path: '/ru/', label: 'home', island: 'HeroShader' },
  { path: '/en/journal', label: 'journal', island: 'JournalBroadsheet' },
  { path: '/ru/journal', label: 'journal', island: 'JournalBroadsheet' },
  { path: '/en/journal/blockchain', label: 'post', island: 'VideoPlayer' },
  { path: '/ru/journal/blockchain', label: 'post', island: 'VideoPlayer' },
  { path: '/en/guide/phishing', label: 'guide', island: 'MobileMenu' },
  { path: '/ru/guide/phishing', label: 'guide', island: 'MobileMenu' },
  { path: '/en/course', label: 'course', island: 'CourseProgress' },
  { path: '/ru/course', label: 'course', island: 'CourseProgress' },
  { path: '/en/course/threat-fundamentals', label: 'module', island: 'ModuleLessons' },
  { path: '/ru/course/threat-fundamentals', label: 'module', island: 'ModuleLessons' },
  {
    path: '/en/course/threat-fundamentals/attack-vectors',
    label: 'lesson',
    island: 'OpsDebriefPanel',
  },
  {
    path: '/ru/course/threat-fundamentals/attack-vectors',
    label: 'lesson',
    island: 'OpsDebriefPanel',
  },
  { path: '/en/game', label: 'game', island: 'GameLauncher' },
  { path: '/ru/game', label: 'game', island: 'GameLauncher' },
  { path: '/en/about', label: 'about', island: 'MobileMenu' },
  { path: '/ru/about', label: 'about', island: 'MobileMenu' },
  { path: '/en/search', label: 'search', island: 'SearchConsole' },
  { path: '/ru/search', label: 'search', island: 'SearchConsole' },
  { path: '/en/check', label: 'check', island: 'MessageAnalyzer' },
  { path: '/ru/check', label: 'check', island: 'MessageAnalyzer' },
];

/**
 * A scam fixture (Sberbank / OTP / bit.ly) engineered to trip several rules in
 * frontend/src/data/redflags.ts: urgency, otp_ask, account_threat,
 * impersonation (bank security), login_link_bait, url_shortener.
 */
export const SCAM_FIXTURE =
  'URGENT: This is Sberbank security department. We detected unauthorized access ' +
  'and your account will be blocked. To avoid suspension, tell us the one-time ' +
  'code we sent you and confirm your identity via this link: bit.ly/secure-acct';

/** A plainly benign message that should fire zero red flags. */
export const BENIGN_FIXTURE = 'hi, are we still on for lunch tomorrow?';

/**
 * Collect console errors / pageerrors while a page runs. Returns a live array
 * that the caller asserts on after navigation + interaction settle.
 *
 * We treat console.error and uncaught pageerror as failures. We deliberately do
 * NOT fail on console.warn — the i18n layer warns intentionally, and the
 * dedicated i18n spec asserts the absence of those warnings.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
}

/**
 * Assert that at least one island actually hydrated. Strategy: wait for the
 * named island element to exist, then confirm React mounted into it by checking
 * the element is present and the global island bootstrap ran (the entry bundle
 * clears `[data-component]` innerHTML and re-renders). We assert the element
 * resolved to a non-empty rendered subtree.
 */
export async function expectIslandHydrated(page: Page, name: string): Promise<void> {
  const el = page.locator(`[data-component="${name}"]`).first();
  await expect(el).toBeAttached();
  // After hydration the island has real child nodes (React rendered into it).
  // Poll until the subtree is non-empty — covers lazy-chunk load latency.
  await expect
    .poll(
      async () =>
        el.evaluate((node) => node.childElementCount > 0 || node.textContent!.trim().length > 0),
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Filter console errors down to genuine application errors.
 *
 * The browser emits a URL-less "Failed to load resource: the server responded
 * with a status of 404" console error for every failed asset request. In this
 * environment /media/* (videos, posters) and per-content OG images are served
 * by prod nginx and 404 locally — that is expected (see project memory: "media
 * on prod nginx, local 404s OK"). Because the console text carries NO URL, we
 * can't tell which 404 it was from the text alone, so we drop generic
 * resource-load 404 lines here and rely on `appFailedResponses` (URL-aware) to
 * catch any NON-media 4xx/5xx that would be a real bug.
 */
export function appConsoleErrors(errors: string[]): string[] {
  return errors.filter((e) => {
    if (/Failed to load resource: the server responded with a status of (404|403)/i.test(e)) {
      return false;
    }
    return true;
  });
}

/** Paths whose 4xx is expected locally because prod nginx serves them. */
const PROD_ONLY_ASSET_RE = /(\/media\/|\/static\/images\/og\/)/;

/**
 * Collect failed (>=400) responses by URL while a page loads. Pair with
 * `appFailedResponses` to ignore the prod-only media/og assets.
 */
export function collectFailedResponses(page: Page): string[] {
  const failed: string[] = [];
  page.on('response', (resp) => {
    if (resp.status() >= 400) failed.push(`${resp.status()} ${resp.url()}`);
  });
  return failed;
}

/** Drop prod-only asset 4xx; what remains is a real failed request. */
export function appFailedResponses(failed: string[]): string[] {
  return failed.filter((f) => !PROD_ONLY_ASSET_RE.test(f));
}
