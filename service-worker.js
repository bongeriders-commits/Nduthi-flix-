// Cabro City — service worker
// Bump CACHE_NAME on every deploy to force all clients onto fresh assets.
const CACHE_NAME = "cabro-city-v5";

const PRECACHE_URLS = [
  "/",
  "/item-details",
  "/katani-approvals",
  "/stock-list",
  "/suppliers",
  "/grn",
  "/issue",
  "/dispatch",
  "/branch-select",
  "/settings",
  "/audit",
  "/manifest.json",
  "/cabro-city-logo.png",
  "/icon-192.png",
  "/icon-512.png"
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
    ).then(() => self.clients.claim())
     .then(() =>
      // A new SW just took over — tell every open tab so it can reload
      // itself onto the fresh version instead of silently staying on
      // whatever page code it already had loaded in memory.
      self.clients.matchAll({ type: "window" }).then((clients) =>
        clients.forEach((client) => client.postMessage({ type: "SW_UPDATED" }))
      )
    )
  );
});

// Never touch Firebase/Firestore traffic — always go straight to network.
function isFirebaseRequest(url) {
  return (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebasestorage") ||
    url.hostname.includes("gstatic.com")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (isFirebaseRequest(url)) return;

  // Page navigations (typing a URL, clicking a link, hamburger nav, etc.)
  // go network-first: whoever opens a page always gets the latest deployed
  // HTML/JS if they're online, so a new release shows up immediately
  // instead of "until I refresh". Cache is only the offline fallback, and
  // a short timeout keeps a slow network from stalling the page indefinitely.
  if (event.request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(event.request).then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        }),
        new Promise((resolve) =>
          setTimeout(() => caches.match(event.request).then(resolve), 2500)
        )
      ]).catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (images/icons/manifest) — cache-first, they're already
  // fingerprint-free but served with long immutable Cache-Control, and
  // rarely change, so instant-from-cache is the right tradeoff here.
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
