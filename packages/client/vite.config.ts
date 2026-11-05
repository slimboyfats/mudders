import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { defineConfig, type Plugin } from 'vite';

// Build target follows the root `browserslist` (Baseline 2026, REQUIREMENTS §9).
const target = browserslistToEsbuild(browserslist.loadConfig({ path: '../..' }));

/**
 * PWA (milestone 5): emits `sw.js` with every build file precached, so after one visit the game
 * installs and local play works offline. The version is a hash of the file list, so each build
 * replaces the previous cache. Dev builds have no service worker.
 */
function pwa(): Plugin {
  return {
    name: 'mudders-pwa',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .sort();
      const precache = [
        './',
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/favicon-32.png',
        'icons/apple-touch-icon.png',
        ...files.filter((f) => f !== 'index.html'),
      ];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./pwa/sw-template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), pwa()],
  base: process.env.MUDDERS_BASE ?? '/',
  build: { target, sourcemap: true },
  server: { port: 5173, host: true },
});
