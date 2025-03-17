import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';
import manifest from './public/manifest.json';

export default defineConfig({
  plugins: [
    react(),
    // The CRX plugin uses your manifest for background, icons, etc.
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
        // 1) The custom new tab page HTML
        newtab: 'src/pages/newtab/newtab.html'
      },
      output: {
        // Standard naming patterns
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