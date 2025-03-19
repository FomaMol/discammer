import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorkerPlugin } from './vite-plugin-sw';

export default defineConfig({
  // serviceWorkerPlugin runs on `build` only (apply: 'build'); it reads the
  // emitted Vite manifest and writes a versioned `backend/static/sw.js` — see
  // vite-plugin-sw.ts. FastAPI serves that file from root scope (GET /sw.js).
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
  // The bundle is served under /static/ by FastAPI. Without this base, Vite's
  // preload helper computes cross-chunk URLs from the default base `/` (e.g.
  // `/js/chunks/x.js`) which 404 — the dynamic import() still resolves
  // relatively so the page works, but every island chunk gets fetched twice
  // (one 404 + one real). Setting base to the serve path makes the baked-in
  // chunk/preload URLs absolute-correct (`/static/js/chunks/x.js`). Manifest
  // `file` paths stay outDir-relative, so base.html's `/static/` prefix is
  // unaffected.
  base: '/static/',
  resolve: {
    // Force a single React/ReactDOM copy across the entry and all lazy chunks
    // so hooks share the same dispatcher (otherwise we get error #321).
    // This MUST stay: it is what makes code-splitting safe — every dynamic
    // chunk resolves the same React instance as the entry.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: false,
    assetsDir: '.',
    // Emit <outDir>/.vite/manifest.json so the backend can resolve hashed
    // entry/chunk/css filenames at render time (backend/assets.py).
    manifest: true,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        // Content-hashed filenames are the ONLY cache-busting mechanism now.
        // No `?v=` query strings on JS/CSS — a `?v=`-stamped entry URL was the
        // cause of the historic React error #321 (two React instances). With
        // real code-splitting back on, each React.lazy island becomes its own
        // hashed chunk (e.g. Plyr only loads on post pages, not the home page).
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0]?.endsWith('.css')) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
