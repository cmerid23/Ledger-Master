const CACHE = "clearledger-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/dashboard",
  "/offline.html",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // API requests: network-only
  if (url.pathname.startsWith("/api/")) return;

  // Navigation: network-first, fallback to offline page
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
