// Service Worker: Countdown works offline after the first visit.
const VERSION = 'cd-2026-11-05';
const SHELL = ['./', 'index.html', 'countdown-core.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Network first (so updates arrive immediately), cache as offline fallback.
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })));
});
