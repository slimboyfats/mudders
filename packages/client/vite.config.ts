import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

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

/** This machine's IPv4 addresses, so a host on `localhost` can hand phones a LAN link. */
function lanHosts(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
        out.push(a.address);
    }
  }
  // home Wi-Fi (192.168.x) first, then other private ranges (VPN, docker), then anything else
  const rank = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : /^(10|172\.(1[6-9]|2\d|3[01]))\./.test(ip) ? 1 : 2;
  return out.sort((a, b) => rank(a) - rank(b));
}

// Same-network play: the page reaches the signal server through its own origin at /signal, so a
// phone only needs the one address and port the host's browser shows. `SIGNAL_TARGET` overrides.
const signalProxy: Record<string, ProxyOptions> = {
  '/signal': {
    target: process.env.SIGNAL_TARGET ?? 'http://127.0.0.1:8787',
    ws: true,
    rewrite: (p) => p.replace(/^\/signal/, '') || '/',
  },
};

export default defineConfig(({ command }) => ({
  plugins: [react(), pwa()],
  base: process.env.MUDDERS_BASE ?? '/',
  // LAN addresses go in dev only; a production build must not carry the build machine's IPs
  define: { __MUDDERS_LAN_HOSTS__: JSON.stringify(command === 'serve' ? lanHosts() : []) },
  build: { target, sourcemap: true },
  server: { port: 5173, host: true, proxy: signalProxy },
  preview: { host: true, proxy: signalProxy },
}));
