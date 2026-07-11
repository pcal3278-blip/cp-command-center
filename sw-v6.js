const CACHE = "cp-command-center-6.1.0";
const SHELL = [
  "./",
  "./index.html",
  "./styles-v6.css?v=6.1.0",
  "./app-core-base-v6.js?v=6.1.0",
  "./app-core-ui-v6.js?v=6.1.0",
  "./app-data-v6.js?v=6.1.0",
  "./app-live-v6.js?v=6.1.0",
  "./manifest-v6.webmanifest?v=6.1.0",
  "./icon-v6.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 503, statusText: "Offline" })));
    return;
  }
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
