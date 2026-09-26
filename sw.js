const CACHE_NAME = "russia-trip-shell-v3-20260926";
const APP_SHELL = new URL("./index.html", self.registration.scope).href;
const OFFLINE_PAGE = new URL("./offline.html", self.registration.scope).href;
const CORE_ASSETS = [
  "./", "./index.html", "./offline.html", "./manifest.webmanifest",
  "./release-20260926/styles.css", "./release-20260926/ledger.css", "./release-20260926/weather.css",
  "./release-20260926/app.js", "./release-20260926/overview-map.js", "./release-20260926/route-ui.js", "./release-20260926/geo-map.js",
  "./release-20260926/runtime-storage.js", "./release-20260926/ticket-pdf-preview.js", "./release-20260926/ledger.js",
  "./release-20260926/site-navigation.js", "./release-20260926/weather.js", "./release-20260926/pwa.js", "./release-20260926/trip-data.json",
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
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(APP_SHELL);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(APP_SHELL, response.clone());
        return response;
      } catch {
        return await cache.match(OFFLINE_PAGE) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
