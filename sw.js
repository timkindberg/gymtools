// gymtools service worker — network-first so the installed app stays current.
// Bump CACHE when you change any cached asset.
const CACHE = "gymtools-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/ui.js",
  "./js/store.js",
  "./js/program.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Was there a previous version? (If so, some open page may be showing stale
    // assets and needs a one-time reload to pick up the update.)
    const hadOldVersion = keys.some((k) => k !== CACHE);
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (hadOldVersion) {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        // Rescue pages stuck on old cached code. Safe mid-workout: the session
        // draft is persisted, so a reload resumes exactly where you were.
        try { client.navigate(client.url); } catch (e) { /* ignore */ }
      }
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only handle same-origin; let cross-origin (e.g. YouTube links) pass through.
  if (url.origin !== self.location.origin) return;

  // Network-first: always try the network so the app self-updates when online;
  // fall back to the cache when offline.
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then((cached) =>
        cached || (req.mode === "navigate" ? caches.match("./index.html") : undefined)
      )
    )
  );
});
