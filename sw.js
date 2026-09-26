const CACHE_NAME = "russia-trip-shell-v2-20260925";
const APP_SHELL = new URL("./index.html", self.registration.scope).href;
const OFFLINE_PAGE = new URL("./offline.html", self.registration.scope).href;
const CORE_ASSETS = [
  "./", "./index.html", "./offline.html", "./manifest.webmanifest",
  "./styles.css", "./ledger.css", "./weather.css",
  "./app.js", "./overview-map.js", "./route-ui.js", "./geo-map.js",
  "./runtime-storage.js", "./ticket-pdf-preview.js", "./ledger.js",
  "./site-navigation.js", "./weather.js", "./pwa.js", "./trip-data.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("russia-trip-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL, response.clone());
        }
        return response;
      } catch {
        return await caches.match(APP_SHELL) || await caches.match(OFFLINE_PAGE);
      }
    })());
    return;
  }

  if (url.pathname.endsWith("/trip-data.json")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      } catch {
        return await caches.match(request, { ignoreSearch: true }) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
    return response;
  })());
});
