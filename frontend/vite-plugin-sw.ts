import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Plugin, ResolvedConfig } from 'vite';

/**
 * PERF-3 — emit a versioned, self-contained service worker into the Vite
 * `outDir` (`backend/static/`) after every build.
 *
 * Why a bespoke plugin instead of vite-plugin-pwa / Workbox: full control over
 * the anti-stale strategy matters more than convenience here (a bad SW has
 * bricked this site before), and it keeps the output dependency-free and
 * CSP-safe (no `importScripts` of a CDN/Workbox runtime).
 *
 * The generated worker is written to `<outDir>/sw.js`. FastAPI serves it from
 * root scope at `GET /sw.js` with `Cache-Control: no-cache` so every browser
 * re-fetches it and detects a new deploy. Its VERSION token is a content hash
 * of the precached shell, so the bytes of `sw.js` change (and old caches get
 * purged) whenever any shell asset changes — and stay identical when nothing
 * does, keeping the committed static output reproducible.
 */

interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
}
type ViteManifest = Record<string, ManifestChunk>;

// Precache the app shell: the entry plus the on-device tool islands so that
// /check, /inspect, the home checker and guide knowledge-checks work offline.
// Every OTHER chunk (VideoPlayer/Plyr, hero effects, …) is intentionally left
// to runtime cache-first so first paint isn't taxed by downloading them all.
const PRECACHE_ENTRIES = [
  'src/main.tsx',
  'src/components/MessageAnalyzer.tsx', // /check
  'src/components/LinkInspector.tsx', // /inspect
  'src/components/MessageChecker.tsx', // home
  'src/components/KnowledgeCheck.tsx', // guides
];

const ICON_URLS = ['/static/favicon.svg', '/static/logomark.svg'];
const OFFLINE_URL = '/static/offline.html';

function collectChunkUrls(
  manifest: ViteManifest,
  key: string,
  out: Set<string>,
  seen: Set<string>,
): void {
  if (seen.has(key)) return;
  seen.add(key);
  const record = manifest[key];
  if (!record) return;
  if (record.file) out.add('/static/' + record.file);
  for (const css of record.css || []) out.add('/static/' + css);
  for (const imp of record.imports || []) collectChunkUrls(manifest, imp, out, seen);
}

export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'discammer-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    // Run after Rollup has written the bundle + manifest.
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      // sw-src.js + offline.html live at the project root (config.root), which
      // avoids relying on __dirname under "type": "module".
      const templatePath = resolve(config.root, 'sw-src.js');
      const offlineSrcPath = resolve(config.root, 'offline.html');
      const manifestPath = join(outDir, '.vite', 'manifest.json');
      if (!existsSync(manifestPath)) {
        this.warn(`[sw] manifest not found at ${manifestPath}; skipping sw.js`);
        return;
      }
      const manifest: ViteManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      // 1. Copy the offline fallback into the static output (self-contained,
      //    JS-free — see offline.html) and precache it.
      const offlineHtml = readFileSync(offlineSrcPath, 'utf-8');
      writeFileSync(join(outDir, 'offline.html'), offlineHtml);

      // 2. Resolve the shell URLs from the manifest + fonts + icons + offline.
      const urls = new Set<string>();
      const seen = new Set<string>();
      for (const entry of PRECACHE_ENTRIES) collectChunkUrls(manifest, entry, urls, seen);

      const fontsDir = join(outDir, 'fonts');
      if (existsSync(fontsDir)) {
        for (const name of readdirSync(fontsDir)) {
          if (name.endsWith('.woff2')) urls.add('/static/fonts/' + name);
        }
      }
      for (const icon of ICON_URLS) {
        if (existsSync(join(outDir, icon.replace('/static/', '')))) urls.add(icon);
      }
      urls.add(OFFLINE_URL);

      const precacheUrls = Array.from(urls).sort();
      const template = readFileSync(templatePath, 'utf-8');

      // 3. Derive VERSION from the CONTENT of every precached asset AND the
      //    worker template itself, so the cache version bumps (and activate()
      //    purges old caches) whenever EITHER a shell asset OR the worker's own
      //    routing logic changes. Deterministic + reproducible: identical
      //    inputs → identical version, so committed static stays stable.
      const hash = createHash('sha256');
      hash.update(template);
      for (const url of precacheUrls) {
        const filePath = join(outDir, url.replace('/static/', ''));
        hash.update(url + '\0');
        if (existsSync(filePath)) hash.update(readFileSync(filePath));
      }
      const version = hash.digest('hex').slice(0, 12);

      // 4. Substitute placeholders in the worker template and emit sw.js.
      // replaceAll (not replace): each token can appear more than once, and
      // replace() would only substitute the first occurrence.
      const worker = template
        .replaceAll('__SW_VERSION__', version)
        .replaceAll('__PRECACHE_URLS__', JSON.stringify(precacheUrls))
        .replaceAll('__OFFLINE_URL__', OFFLINE_URL);

      writeFileSync(join(outDir, 'sw.js'), worker);
      this.info(`[sw] wrote sw.js (version ${version}, ${precacheUrls.length} precached URLs)`);
    },
  };
}
