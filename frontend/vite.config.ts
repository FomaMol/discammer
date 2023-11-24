import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Force a single React/ReactDOM copy across the entry and all lazy chunks
    // so hooks share the same dispatcher (otherwise we get error #321).
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    outDir: '../backend/static',
    emptyOutDir: false,
    assetsDir: '.',
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        // Inline dynamic imports so React.lazy chunks don't end up importing
        // `./app.js` from a second module instance — when app.js is loaded
        // with a `?v=` cache-bust query, the chunk's bare import resolves to
        // a different URL, the browser instantiates app.js twice, and we end
        // up with two Reacts (Invalid hook call, error #321).
        inlineDynamicImports: true,
        entryFileNames: 'js/app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0]?.endsWith('.css')) {
            return 'css/[name][extname]';
          }
          return '[name][extname]';
        },
      },
    },
  },
});
