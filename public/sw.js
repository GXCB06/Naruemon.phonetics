// Melobi's service worker: a small runtime cache, only in production (see components/pwa/ServiceWorker.tsx).
//
// It is deliberately conservative: pages are network-first (so a deploy is never hidden behind a stale shell) with the
// last good copy as an offline fallback; hashed Next.js assets and icons are cache-first because their names change when
// they change. Nothing learner-made (recordings, attempts, drawings) is ever cached.

const CACHE = "melobi-v1";
const MAX_ENTRIES = 80;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Keep the cache from growing without bound: drop the oldest entries once there are too many. */
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|ico|webp|avif|mp3)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          await cache.put(request, res.clone());
          await trim(cache);
        }
        return res;
      })(),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) {
            await cache.put(request, res.clone());
            await trim(cache);
          }
          return res;
        } catch {
          return (await cache.match(request)) ?? (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
  }
});
