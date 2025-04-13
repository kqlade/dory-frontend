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
    minify: true,
    rollupOptions: {
      input: {
        // Explicitly map the HTML page from the manifest to its JS entry point
        // Even though index.html doesn't exist physically, this tells Vite
        // which JS file to associate with it when the CRX plugin processes it.
        'index.html': path.resolve(__dirname, 'main.tsx'),
        // Add mappings for other HTML pages defined in your manifest if needed:
        // 'src/pages/sidepanel/sidepanel.html': path.resolve(__dirname, 'src/pages/sidepanel/index.tsx'), 
        // 'src/pages/options/options.html': path.resolve(__dirname, 'src/pages/options/index.tsx'),
      },
      output: {
        // Standard naming patterns
        entryFileNames: '[name].js',
        // Ensure consistent chunk naming if needed
        // chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Check if the asset is NewTabSearchBar.css
          if (assetInfo.name === 'NewTabSearchBar.css') {
            // Output it to assets folder with a fixed name
            return `assets/NewTabSearchBar.css`;
          }
          // Use default naming (with hash) for other assets
          return `assets/[name]-[hash].[ext]`;
        },
      }
    }
  },
  optimizeDeps: {
    include: ['html-entities', 'react', 'react-dom']
  }
});