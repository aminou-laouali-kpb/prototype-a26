/* Prototype A26 — cache shell léger pour 2G / hors-ligne partiel */
const CACHE = 'a26-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/vite.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache Vite HMR / source modules — they change constantly in dev.
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.search.includes('t=')) return;

  // Network-first for navigation
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match(req))),
    );
    return;
  }

  if (url.pathname.match(/\.(css|svg|png|woff2|webmanifest)$/)) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
      ),
    );
  }
});
