/** Resolve the signalling server base URL from a Vite env value, defaulting to the local dev server. */
export function resolveSignalUrl(envValue: string | undefined, search = ''): string {
  // `?signal=http://127.0.0.1:PORT` points a page at a local test server (play:net). Only loopback
  // addresses are accepted, so a shared link can't send players to someone else's server.
  const q = new URLSearchParams(search).get('signal');
  if (q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q)) return q.replace(/\/+$/, '');
  const url = envValue?.trim() || 'http://localhost:8787';
  return url.replace(/\/+$/, '');
}

export const SIGNAL_URL = resolveSignalUrl(
  import.meta.env.VITE_SIGNAL_URL,
  typeof location === 'undefined' ? '' : location.search,
);
