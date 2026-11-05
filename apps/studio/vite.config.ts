import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Renderer build. `base: './'` so the built index.html loads from file:// in Electron.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5175, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // overlay.html is the OBS browser-source fallback page.
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), overlay: resolve(__dirname, 'overlay.html') } },
  },
  test: {
    include: ['electron/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
