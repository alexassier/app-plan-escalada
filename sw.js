/* Plan de escalada · funciona sin conexión.
   Sirve lo guardado al instante y lo actualiza en segundo plano:
   los cambios subidos a GitHub se ven en la siguiente apertura.
   Si cambias la lista de archivos, sube el número de VERSION. */
const VERSION = "escalada-v2";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "plan-data.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === "navigate" ? "index.html" : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      const net = fetch(req)
        .then((res) => { if (res.ok || res.type === "opaque") cache.put(key, res.clone()); return res; })
        .catch(() => hit);
      if (hit) { e.waitUntil(net); return hit; }
      return net;
    })
  );
});
