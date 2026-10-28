import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // MapLibre alone is ~1 MB minified; splitting it would not make the first load smaller.
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
