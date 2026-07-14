const CACHE_NAME = "cp-command-center-7.2.3-device-voice";
const APP_SHELL = [
  "./",
  "./styles-v6.css?v=6.1.0",
  "./app-core-base-v6.js?v=7.2.3",
  "./app-core-ui-v6.js?v=6.1.0",
  "./app-data-v6.js?v=7.2.3",
  "./app-live-v6.js?v=6.1.0",
  "./cast25-built-in.js?v=2026-07-11-1",
  "./readings/cast25-2026-07-11.txt?v=2026-07-11-1",
  "./manifest-v6.webmanifest?v=7.2.3",
  "./icon-v6.svg"
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

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (!sameOrigin) return;
  event.respondWith(cacheFirstStatic(request));
});

async function networkFirstNavigation(request) {
  try {
    const canonicalUrl = new URL(request.url);
    if (canonicalUrl.pathname.endsWith("/index.html")) {
      canonicalUrl.pathname = canonicalUrl.pathname.slice(0, -"index.html".length);
    }

    const response = await fetch(canonicalUrl.href, {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok || response.redirected) throw new Error(`Navigation failed: ${response.status}`);

    const enhancedResponse = await injectCast25(response);
    const cache = await caches.open(CACHE_NAME);
    await cache.put("./", enhancedResponse.clone());
    return enhancedResponse;
  } catch {
    const cached = await caches.match("./", { ignoreSearch: true });

    return cached || new Response(
      "CP Command Center is temporarily unavailable. Reconnect and reopen the app.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}

async function injectCast25(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();
  const scripts = [
    '<script src="./cast25-built-in.js?v=2026-07-11-1" defer></script>'
  ];

  for (const script of scripts) {
    const source = script.match(/src="([^"]+)/)?.[1]?.split("?")[0];
    if (source && !html.includes(source)) html = html.replace("</body>", `  ${script}\n</body>`);
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "no-cache");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    refreshStatic(request);
    return cached;
  }

  const response = await fetch(request);
  if (response.ok && !response.redirected && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

function refreshStatic(request) {
  fetch(request, { cache: "no-cache" })
    .then(async response => {
      if (!response.ok || response.redirected || response.type !== "basic") return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response);
    })
    .catch(() => {});
}
