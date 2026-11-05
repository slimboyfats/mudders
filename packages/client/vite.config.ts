import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { defineConfig } from 'vite';

// Build target follows the root `browserslist` (Baseline 2026, REQUIREMENTS §9).
const target = browserslistToEsbuild(browserslist.loadConfig({ path: '../..' }));

export default defineConfig({
  plugins: [react()],
  base: process.env.MUDDERS_BASE ?? '/',
  build: { target, sourcemap: true },
  server: { port: 5173, host: true },
});
