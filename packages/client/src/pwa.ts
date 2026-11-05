/**
 * PWA install (milestone 5): registers the service worker in production builds and keeps the
 * browser's install prompt for the title screen's "Install" button. `beforeinstallprompt` is a
 * Chromium-only event (not Baseline), so everything here is feature-checked; iOS Safari gets an
 * "Add to Home Screen" hint instead.
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const subs = new Set<() => void>();
const notify = () => {
  for (const fn of subs) fn();
};

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  const q = new URLSearchParams(location.search);
  if (import.meta.env.PROD && 'serviceWorker' in navigator && q.get('sw') !== '0') {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e: unknown) => {
      console.warn('service worker not registered', e);
    });
  }
}

export function subscribeInstall(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Running as an installed app already. */
export function isInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallState = 'prompt' | 'ios' | 'none';

export function installState(): InstallState {
  if (isInstalled()) return 'none';
  if (deferred) return 'prompt';
  const ua = navigator.userAgent;
  // iPadOS reports a Mac user agent; touch points give it away
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios' : 'none';
}

export async function promptInstall(): Promise<void> {
  const p = deferred;
  if (!p) return;
  deferred = null;
  await p.prompt();
  await p.userChoice.catch(() => undefined);
  notify();
}
