// gymtools service worker — the app opens from the cache, and updates behind it.
//
// Until v51 this was network-first with no timeout: every launch waited on ~20
// requests to GitHub Pages before anything could paint, one after another as
// each module discovered its imports. On gym wifi that was seconds of blank
// screen, and on a connection that half-works it was as long as the phone took
// to give up. Now every cached file is answered from the cache at once.
//
// Updates still arrive on their own: the page asks for a fresh sw.js on load and
// whenever it comes back to the foreground. A new CACHE name means a new worker,
// which downloads the whole app into its own cache, takes over, and reloads the
// open page once. So CACHE MUST CHANGE ON EVERY DEPLOY or installed apps never
// see the change. Bump it with APP_VERSION (js/version.js); the deploy workflow
// also appends the commit hash, so a forgotten bump can't strand anyone.
const CACHE = "gymtools-v52";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/ui.js",
  "./js/store.js",
  "./js/program.js",
  "./js/movements.js",
  "./js/measures.js",
  "./js/sets.js",
  "./js/engine.js",
  "./js/goals.js",
  "./js/plates.js",
  "./js/effort.js",
  "./js/config.js",
  "./js/sync.js",
  "./js/version.js",
  "./js/orientation.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // cache: "reload" skips the browser's own HTTP cache, which would happily
  // hand a ten-minute-old copy of a file to a brand-new version.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
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

  // Anything that asks for a fresh copy on purpose gets the network (the
  // Settings footer checks version.js this way to see if an update is out).
  if (req.cache === "no-store" || req.cache === "reload") return;

  // Cache-first. Only what this version cached is ever served, so the modules
  // on screen always belong to the same release.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req) ||
      (req.mode === "navigate" ? await cache.match("./index.html") : undefined);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  })());
});
