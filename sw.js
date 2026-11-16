/* Mudders service worker (§8: PWA install, offline local play). Generated at build time by the
 * `pwa` plugin in vite.config.ts, which fills in VERSION and PRECACHE. Plain JS: it runs as-is. */
const VERSION = '5ff6c4516daf';
const PRECACHE = ["./","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/favicon-32.png","icons/apple-touch-icon.png","docs/","assets/ChallengePlay-DE2rV-0O.js","assets/Challenges-DihThLaZ.js","assets/Changelog-91EhDc_f.js","assets/MatchView-4lXaJh-r.js","assets/Online-CNEoQOo4.js","assets/Play-BO6jxT0_.js","assets/Sandbox-Bm5wInRC.js","assets/Setup-BBOs0PHK.js","assets/Teams-BKbQ5kSv.js","assets/battle-C98AQSKG.mod","assets/categories-aQ0FYqsp.js","assets/changelog-B4tlUbDG.js","assets/docs-D3fHi9AW.css","assets/docs-DIXSjJPY.js","assets/engine-mvTq5ZG6.js","assets/main-BbUbEjXn.css","assets/main-DKVTZtHf.js","assets/module-BImwpPm9.js","assets/pixel-nQlZkGM_.js","assets/snapshot-DJ3WWjcv.js","assets/title-D3QcMLaq.mod","audio/chiptune3.worklet.js","audio/libopenmpt.worklet.js"];
const CACHE = `mudders-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('mudders-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // only our own files: the lobby server, STUN and anything else go straight to the network
  if (url.origin !== self.location.origin) return;
  // the lobby server proxied through this origin (same-network play) is never cached
  if (url.pathname.startsWith(new URL('signal/', self.registration.scope).pathname)) return;
  if (req.mode === 'navigate') {
    // the page: network first so an update lands at once; the cached copy when offline. The
    // field manual (docs/) is its own page and keeps its own cache entry, never the game shell's
    const scope = new URL(self.registration.scope).pathname;
    const page = url.pathname.startsWith(`${scope}docs/`) ? 'docs/' : './';
    const key = new URL(page, self.registration.scope).href;
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key).then((r) => r ?? Response.error())),
    );
    return;
  }
  // hashed build files never change: cache first. `ignoreVary`: module scripts are CORS requests
  // (with an Origin header) and a server that sends `Vary: Origin` would otherwise never match
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
