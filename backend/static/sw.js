/*
 * DiScammer service worker (PERF-3).
 *
 * This is a TEMPLATE: `vite-plugin-sw.ts` substitutes the version, precache-list
 * and offline-URL placeholders below at build time and writes the result to
 * `backend/static/sw.js`, which FastAPI serves from ROOT scope (`GET /sw.js`,
 * `Cache-Control: no-cache`). Do not edit the generated file — edit this one.
 *
 * ── Anti-stale contract (this project has been bricked by a stale SW before;
 *    see the iOS Cache-Control incident, commit 78ec137) ─────────────────────
 *
 *   1. HTML / navigations   → NETWORK-FIRST, offline-only fallback. Online
 *      users ALWAYS get the fresh document from the network; the cached copy is
 *      served ONLY when the network fails (offline). A broken/stale document
 *      can therefore never be pinned. This mirrors the origin's `no-cache` on
 *      HTML.
 *   2. Hashed static assets → CACHE-FIRST. `/static/js|css/*` carry content
 *      hashes in their filenames and are immutable; self-hosted fonts and the
 *      brand SVG icons are deploy-versioned and treated the same.
 *   3. /api/*               → NOT intercepted → straight to network. A stale
 *      API / threat-rules / metrics response must never be served as fresh.
 *   4. Versioned caches     → every cache name carries VERSION; on `activate`
 *      every cache NOT in the current allowlist is deleted, so an old bundle
 *      cannot linger. VERSION is a content hash of the precached shell, so it
 *      changes on every deploy that changes any shell asset.
 *   5. Lifecycle            → skipWaiting() + clients.claim() so a new worker
 *      takes control promptly — safe precisely because of rules 1 and 4.
 */

const VERSION = '98a8fc47877a';
const PRECACHE_URLS = ["/static/css/main-jzprVlwT.css","/static/favicon.svg","/static/fonts/geist-cyrillic-ext.woff2","/static/fonts/geist-cyrillic.woff2","/static/fonts/geist-latin-ext.woff2","/static/fonts/geist-latin.woff2","/static/fonts/jetbrains-mono-cyrillic-ext.woff2","/static/fonts/jetbrains-mono-cyrillic.woff2","/static/fonts/jetbrains-mono-latin-ext.woff2","/static/fonts/jetbrains-mono-latin.woff2","/static/js/chunks/IncidentActionWizard-BKGYLpQe.js","/static/js/chunks/KnowledgeCheck-Bwg1tCWf.js","/static/js/chunks/LinkInspector-osSGFbgE.js","/static/js/chunks/MessageAnalyzer-CAxaxrUa.js","/static/js/chunks/MessageChecker-BLVy2_5U.js","/static/js/chunks/i18n-gVZb7XXq.js","/static/js/chunks/progress-C6rp_L2-.js","/static/js/chunks/redflags-Dfk9x4ad.js","/static/js/chunks/theme-color-CltKEOde.js","/static/js/chunks/threat_feed-BciEgeoR.js","/static/js/chunks/useReducedMotion-BKRNTNcb.js","/static/js/main-CYf2bJAn.js","/static/logomark.svg","/static/offline.html"];
const OFFLINE_URL = '/static/offline.html';

// Caches are namespaced by VERSION so activate() can purge everything from a
// previous build in one sweep (rule 4).
const PRECACHE_CACHE = `discammer-precache-${VERSION}`;
const PAGES_CACHE = `discammer-pages-${VERSION}`;
const ASSETS_CACHE = `discammer-assets-${VERSION}`;
const CURRENT_CACHES = [PRECACHE_CACHE, PAGES_CACHE, ASSETS_CACHE];

// ── install: best-effort precache of the app shell ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_CACHE);
      // Best-effort, per-URL: one unavailable asset must NOT reject the whole
      // install. A rejected install leaves the OLD worker in control; we would
      // rather activate the new worker and let runtime caching backfill a miss.
      // `cache: 'reload'` bypasses the HTTP cache so the shell is fetched fresh.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      // Rule 5: don't wait for old tabs to close before this worker can activate.
      await self.skipWaiting();
    })(),
  );
});

// ── activate: purge every cache outside the current version allowlist ──────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('discammer-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      // Rule 5: take control of already-open clients immediately.
      await self.clients.claim();
    })(),
  );
});

// ── request routing ────────────────────────────────────────────────────────
function isHashedAsset(pathname) {
  // Vite content-hashed bundles: `/static/js/..-<hash>.js`, `/static/css/..-<hash>.css`.
  return /^\/static\/(js|css)\//.test(pathname);
}

function isImmutableStatic(pathname) {
  // Self-hosted fonts + the two brand SVG icons: stable names, but the bytes
  // only change on deploy and are part of the precache — safe as cache-first.
  return (
    /^\/static\/fonts\//.test(pathname) ||
    pathname === '/static/favicon.svg' ||
    pathname === '/static/logomark.svg'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET is cacheable; POST beacons (client-errors, CSP reports) and any
  // other method go straight to the network untouched.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only — never touch cross-origin (OG images, embeds, analytics).
  if (url.origin !== self.location.origin) return;

  // Rule 3: the API is always live. Never cached, never served stale.
  if (url.pathname.startsWith('/api/')) return;

  // The worker file must always hit the network so a new deploy is picked up.
  if (url.pathname === '/sw.js') return;

  // The Unity game bundle has its own headers/semantics (WASM, framing) — leave
  // it entirely to the network.
  if (url.pathname === '/play' || url.pathname.startsWith('/play/')) return;

  // Rule 1: documents / navigations → network-first with an offline-only
  // fallback. Match on navigation mode, the `document` destination, AND an
  // HTML Accept header so an HTML response can never reach the caching branches
  // below (a stale document must never be served — this project's iOS incident).
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || req.destination === 'document' || accept.includes('text/html')) {
    event.respondWith(networkFirstPage(req));
    return;
  }

  // Rule 2: hashed + immutable static assets → cache-first.
  if (isHashedAsset(url.pathname) || isImmutableStatic(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else same-origin (manifest, robots, sitemap, feed, images) →
  // stale-while-revalidate AT MOST: serve cache if present but always refresh in
  // the background so the next load is current.
  event.respondWith(staleWhileRevalidate(req));
});

// Network-first: the ONLY document strategy. The cached copy is a fallback used
// exclusively on network failure (offline) — online loads are always fresh.
async function networkFirstPage(req) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const fresh = await fetch(req);
    // Only stash genuine, same-origin 200s (never opaque/redirect/error) so we
    // can't pin a bad response as the offline copy.
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // OFFLINE branch only.
    const cachedPage = await cache.match(req);
    if (cachedPage) return cachedPage;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('You are offline.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') {
    const cache = await caches.open(ASSETS_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      // Defense-in-depth for rule 1: never store an HTML document here. Only
      // the network-first path may cache HTML (and only as an offline fallback),
      // so a document can never be served stale from this branch.
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      if (res && res.ok && res.type === 'basic' && !isHtml) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}
