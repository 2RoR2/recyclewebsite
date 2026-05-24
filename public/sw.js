const CACHE_VERSION = "v11";
const CACHE_NAME = `ecocycle-shell-${CACHE_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/recycle-logo.png",
  "/images/qrscan.png"
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>EcoCycle Sarawak Offline</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7fbf2;color:#10251d;font-family:Arial,sans-serif}
      main{max-width:520px;padding:2rem;text-align:center}
      h1{font-size:clamp(2rem,8vw,4rem);line-height:1;margin:.5rem 0}
      p{color:#52645a;line-height:1.55}
      a{display:inline-block;margin-top:1rem;border-radius:999px;background:#ffc600;color:#111;padding:.8rem 1.1rem;text-decoration:none;font-weight:800}
    </style>
  </head>
  <body>
    <main>
      <strong>EcoCycle Sarawak</strong>
      <h1>You are offline</h1>
      <p>The app shell is available, but this page needs a connection. Reconnect and try again.</p>
      <a href="/">Back to app</a>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/ai-model/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || !response.ok) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached || new Response(OFFLINE_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        })))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchAndCache = fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });

      if (cached) {
        if (["script", "style", "worker", "manifest"].includes(request.destination)) {
          event.waitUntil(fetchAndCache.catch(() => undefined));
        }
        return cached;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => {
        if (request.destination === "image") return caches.match("/images/recycle-logo.png");
        return new Response("", { status: 503, statusText: "Offline" });
      });
    })
  );
});
