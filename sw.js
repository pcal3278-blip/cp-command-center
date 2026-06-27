const CACHE_NAME = 'cp-command-center-v6-0-live-20260627';
const ASSETS = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).finally(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => null);
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
    return res;
  }).catch(() => caches.match(event.request)));
});
