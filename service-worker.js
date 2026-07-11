// Cabro City — service worker
// Bump CACHE_NAME to force all clients to refresh cached assets.
const CACHE_NAME = "cabro-city-v1";

const PRECACHE_URLS = [
  "/",
  "/item-details",
  "/katani-approvals",
  "/stock-list",
  "/manifest.json",
  "/cabro-city-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first for Firebase/Firestore traffic, cache-first for the app shell.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebasestorage") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (event.request.method === "GET" && networkResponse.status === 200) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
