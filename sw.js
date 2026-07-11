const CACHE = "cp-command-center-6.1.1-reader";
const SHELL = [
  "./",
  "./index.html",
  "./styles-v6.css?v=6.1.0",
  "./app-core-base-v6.js?v=6.1.0",
  "./app-core-ui-v6.js?v=6.1.0",
  "./app-data-v6.js?v=6.1.0",
  "./app-live-v6.js?v=6.1.0",
  "./reader-visibility-v6.js?v=6.1.1",
  "./neural-reader.js?v=6.1.1",
  "./manifest-v6.webmanifest?v=6.1.0",
  "./icon-v6.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("cp-command-center-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    const helperTag = '<script src="./reader-visibility-v6.js?v=6.1.1" defer></script>';
    const enhancedHtml = html.includes("reader-visibility-v6.js")
      ? html
      : html.replace("</body>", `  ${helperTag}\n</body>`);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("Cache-Control", "no-cache");
    const enhanced = new Response(enhancedHtml, { status: response.status, statusText: response.statusText, headers });

    const cache = await caches.open(CACHE);
    await cache.put("./index.html", enhanced.clone());
    return enhanced;
  } catch {
    return (await caches.match("./index.html", { ignoreSearch: true }))
      || (await caches.match("./", { ignoreSearch: true }))
      || new Response("CP Command Center is temporarily unavailable. Reconnect and reopen the app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
