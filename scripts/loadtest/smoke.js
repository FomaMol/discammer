// DiScammer load-test smoke (PERF-4 · capacity baseline)
//
// Exercises the four traffic classes that matter for the 2-vCPU origin:
//   1. SSR HTML page  (/en/)            — synchronous Jinja render, CPU-bound
//   2. /api/posts      (JSON)           — DB read
//   3. /api/search?q=  (JSON)           — DB full-text read (heaviest API path)
//   4. a media/static asset             — bytes off disk/edge, near-zero CPU
//
// CONSERVATIVE BY DEFAULT: small VU counts so a stray `k6 run` does NOT hammer
// prod. Scale up deliberately via env vars (see README) when you actually want
// to find the degradation point.
//
//   k6 run scripts/loadtest/smoke.js
//   BASE_URL=https://discammer.com k6 run scripts/loadtest/smoke.js
//   PROFILE=stress VUS=50 k6 run scripts/loadtest/smoke.js   // push to find the knee
//
// Compare through-CF vs direct-to-origin by changing BASE_URL (README §"Comparing").

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Config (all overridable via env) ────────────────────────────────────────
const BASE_URL = (__ENV.BASE_URL || 'https://discammer.com').replace(/\/+$/, '');
const PROFILE = __ENV.PROFILE || 'smoke'; // 'smoke' (default, gentle) | 'stress'
const VUS = Number(__ENV.VUS || 10);      // peak VUs for the stress profile

// A representative SSR page and a stable static asset. The OG PNG is a good
// media stand-in: real bytes, served like any other static/media file. (On prod
// the bulk media is served by nginx; locally these may 404 — that's expected,
// the check tolerates it, see README.)
const SSR_PATH = __ENV.SSR_PATH || '/en/';
const POSTS_PATH = __ENV.POSTS_PATH || '/api/posts';
const MEDIA_PATH = __ENV.MEDIA_PATH || '/static/images/og/discammer-og.png';

// Search terms that exist in the seeded content so we exercise real result paths.
const SEARCH_TERMS = (__ENV.SEARCH_TERMS || 'scam,phishing,bank,romance,sms,crypto')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Custom metrics (per traffic class) ──────────────────────────────────────
const errRate = new Rate('errors');
const ssrDur = new Trend('ssr_duration', true);
const postsDur = new Trend('api_posts_duration', true);
const searchDur = new Trend('api_search_duration', true);
const mediaDur = new Trend('media_duration', true);

// ── Load profiles ───────────────────────────────────────────────────────────
// 'smoke': tiny ramp, safe to run against prod anytime.
// 'stress': ramps toward VUS to find the degradation point — run with intent.
const PROFILES = {
  smoke: [
    { duration: '30s', target: 3 },  // warm up
    { duration: '1m', target: 5 },   // steady, gentle
    { duration: '30s', target: 0 },  // ramp down
  ],
  stress: [
    { duration: '1m', target: Math.ceil(VUS / 4) },
    { duration: '2m', target: Math.ceil(VUS / 2) },
    { duration: '2m', target: VUS },   // hold at peak — watch p95/p99 here
    { duration: '1m', target: 0 },
  ],
};

export const options = {
  scenarios: {
    mixed_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: PROFILES[PROFILE] || PROFILES.smoke,
      gracefulRampDown: '20s',
    },
  },
  // Thresholds: a failing run exits non-zero (good for CI / gating).
  // Tune these once real baselines land in docs/deploy/capacity.md.
  thresholds: {
    http_req_failed: ['rate<0.01'],          // <1% transport-level failures
    errors: ['rate<0.02'],                   // <2% app/status check failures
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    ssr_duration: ['p(95)<1000', 'p(99)<2000'],
    api_posts_duration: ['p(95)<500', 'p(99)<1000'],
    api_search_duration: ['p(95)<800', 'p(99)<1500'],
    media_duration: ['p(95)<400', 'p(99)<800'],
  },
  // Discard response bodies we don't assert on — keeps the load generator light.
  discardResponseBodies: false,
  noConnectionReuse: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function record(res, trend, { allow404 = false } = {}) {
  trend.add(res.timings.duration);
  const ok = check(res, {
    'status ok': (r) =>
      r.status === 200 || r.status === 304 || (allow404 && r.status === 404),
  });
  // A 404 we explicitly tolerate is not an error; anything else is.
  errRate.add(!ok);
  return ok;
}

// ── Virtual-user iteration ────────────────────────────────────────────────────
export default function () {
  group('ssr', () => {
    const res = http.get(`${BASE_URL}${SSR_PATH}`, {
      tags: { name: 'ssr' },
      headers: { Accept: 'text/html' },
    });
    record(res, ssrDur);
  });

  group('api_posts', () => {
    const res = http.get(`${BASE_URL}${POSTS_PATH}?lang=en`, {
      tags: { name: 'api_posts' },
    });
    record(res, postsDur);
  });

  group('api_search', () => {
    const q = encodeURIComponent(randomItem(SEARCH_TERMS));
    const res = http.get(`${BASE_URL}/api/search?q=${q}&lang=en`, {
      tags: { name: 'api_search' },
    });
    record(res, searchDur);
  });

  group('media', () => {
    // Media may be served by nginx on prod and 404 locally — tolerate 404 so a
    // local exercise of the script doesn't fail the whole run on the asset path.
    const res = http.get(`${BASE_URL}${MEDIA_PATH}`, {
      tags: { name: 'media' },
    });
    record(res, mediaDur, { allow404: true });
  });

  // Pace each VU so we model think-time rather than a tight hammer loop.
  sleep(Math.random() * 2 + 1); // 1–3s
}
