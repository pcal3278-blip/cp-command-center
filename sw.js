const CACHE_NAME = "cp-command-center-v5-2-1-cellular-repair-20260702";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=5.2.1",
  "./app.js?v=5.2.1",
  "./manifest.webmanifest?v=5.2.1",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("cp-command-center-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_CP_CACHES") {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("cp-command-center-"))
          .map(key => caches.delete(key))
      ))
    );
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Cross-origin weather/news/API calls must stay network-only. Never return
  // index.html for them because that produces invalid JSON and can destabilize startup.
  if (!sameOrigin) return;

  event.respondWith(cacheFirstStatic(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response.ok || response.redirected) throw new Error(`Navigation failed: ${response.status}`);

    const cache = await caches.open(CACHE_NAME);
    await cache.put("./index.html", response.clone());
    return response;
  } catch {
    const cached = await caches.match("./index.html", { ignoreSearch: true })
      || await caches.match("./", { ignoreSearch: true });

    return cached || new Response(
      "CP Command Center is temporarily unavailable. Reconnect and reopen the app.",
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    eventlessRefresh(request);
    return cached;
  }

  const response = await fetch(request);
  if (response.ok && !response.redirected && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

function eventlessRefresh(request) {
  fetch(request, { cache: "no-cache" })
    .then(async response => {
      if (!response.ok || response.redirected || response.type !== "basic") return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response);
    })
    .catch(() => {});
}
