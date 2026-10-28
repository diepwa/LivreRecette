const CACHE = "livre-recettes-v27";
const ASSETS = [
  "./",
  "./index.html",
  "./sync.js",
  "./recipe-pdf.js",
  "./analytics.js",
  "./analytics-config.js",
  "./vendor/amplitude.min.js",
  "./vendor/pdf-lib.min.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/nout.png",
  "./icons/splash.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord (fonctionne hors ligne), mise à jour en arrière-plan.
// On met aussi en cache le SDK Firebase (versionné) pour que la synchro démarre hors ligne.
// Les appels réseau de Firebase (Firestore, Auth) ne passent jamais par ce cache.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const sdk = (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) || url.hostname === "fonts.googleapis.com" || (url.hostname === "fonts.gstatic.com" && url.pathname.startsWith("/s/"));
  if (!sameOrigin && !sdk) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || (sameOrigin ? caches.match("./index.html") : undefined));
      return cached || net;
    })
  );
});
