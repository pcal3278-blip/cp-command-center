const CACHE_NAME = "cp-command-center-v5-3-0-neural-reader-20260702";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=5.3.0",
  "./app.js?v=5.3.0",
  "./news-commute.js?v=5.3.0",
  "./neural-reader.js?v=5.3.0",
  "./manifest.webmanifest?v=5.3.0",
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

  // Cross-origin weather, news, and neural-voice calls stay network-only.
  // Never substitute index.html for JSON, RSS, API, or audio requests.
  if (!sameOrigin) return;

  event.respondWith(cacheFirstStatic(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response.ok || response.redirected) throw new Error(`Navigation failed: ${response.status}`);

    const enhancedResponse = await injectNeuralReader(response);
    const cache = await caches.open(CACHE_NAME);
    await cache.put("./index.html", enhancedResponse.clone());
    return enhancedResponse;
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

async function injectNeuralReader(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const scriptTag = '<script src="./neural-reader.js?v=5.3.0" defer></script>';
  const enhancedHtml = html.includes("neural-reader.js")
    ? html
    : html.replace("</body>", `  ${scriptTag}\n  </body>`);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "no-cache");

  return new Response(enhancedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
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
