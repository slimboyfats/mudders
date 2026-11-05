/** Resolve the signalling server base URL from a Vite env value, defaulting to the local dev server. */
export function resolveSignalUrl(envValue: string | undefined): string {
  const url = envValue?.trim() || 'http://localhost:8787';
  return url.replace(/\/+$/, '');
}

export const SIGNAL_URL = resolveSignalUrl(import.meta.env.VITE_SIGNAL_URL);
