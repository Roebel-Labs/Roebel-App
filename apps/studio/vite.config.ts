import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build. `base: './'` so the built index.html loads from file:// in Electron.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5175, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    include: ['electron/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
