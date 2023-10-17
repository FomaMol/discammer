import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../backend/static',
    emptyOutDir: false,
    assetsDir: '.',
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        entryFileNames: 'js/app.js',
        chunkFileNames: 'js/[name].js',
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
