// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  envPrefix: 'VITE_',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: 'src/background/serviceWorker.ts',
        contentExtractor: 'src/services/contentExtractor.ts',
        activityTracker: 'src/background/activityTracker.ts',
        newtab: 'src/pages/newtab/index.tsx',
        newtabHtml: 'src/pages/newtab/newtab.html'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  },
  optimizeDeps: {
    include: ['html-entities', 'react', 'react-dom']
  }
});