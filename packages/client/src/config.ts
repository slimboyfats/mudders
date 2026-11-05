/**
 * Resolve the signalling server base URL.
 *
 * With no `VITE_SIGNAL_URL`, the page talks to the signal server through its own origin at
 * `/signal` (the Vite dev and preview servers proxy that path to :8787). That way a phone that
 * opened `http://192.168.1.20:5173` reaches the same machine's server, not its own localhost.
 */
export function resolveSignalUrl(envValue: string | undefined, search = '', origin = ''): string {
  // `?signal=http://127.0.0.1:PORT` points a page at a local test server (play:net). Only loopback
  // addresses are accepted, so a shared link can't send players to someone else's server.
  const q = new URLSearchParams(search).get('signal');
  if (q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q)) return q.replace(/\/+$/, '');
  const env = envValue?.trim();
  if (env) return env.replace(/\/+$/, '');
  if (/^https?:\/\//.test(origin)) return `${origin.replace(/\/+$/, '')}/signal`;
  return 'http://localhost:8787';
}

const LOOPBACK = /^(localhost|127(?:\.\d+){3}|\[::1\])$/;

/**
 * Origin to put in invite links. When the host opened the game on `localhost`, a phone can't use
 * that, so swap in the computer's LAN address (found by the dev server at startup) if there is one.
 */
export function shareOrigin(
  loc: { protocol: string; hostname: string; port: string; origin: string },
  lanHosts: readonly string[],
): string {
  const lan = lanHosts[0];
  if (!LOOPBACK.test(loc.hostname) || !lan) return loc.origin;
  return `${loc.protocol}//${lan}${loc.port ? `:${loc.port}` : ''}`;
}

declare const __MUDDERS_LAN_HOSTS__: readonly string[] | undefined;

/** LAN IPv4 addresses of the machine serving the page (dev/preview only; empty otherwise). */
export const LAN_HOSTS: readonly string[] =
  typeof __MUDDERS_LAN_HOSTS__ === 'undefined' ? [] : __MUDDERS_LAN_HOSTS__;

export const SIGNAL_URL = resolveSignalUrl(
  import.meta.env.VITE_SIGNAL_URL,
  typeof location === 'undefined' ? '' : location.search,
  typeof location === 'undefined' ? '' : location.origin,
);
