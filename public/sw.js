const CACHE_NAME = "petflow-offline-v1";
const APP_SHELL = ["/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE_SALES") return;
  const resourcePaths = Array.isArray(event.data.resources)
    ? event.data.resources.filter((path) => typeof path === "string" && path.startsWith("/_next/static/"))
    : [];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const page = await fetch("/app/vendas/offline", { credentials: "include" });
    if (page.ok && !page.redirected) await cache.put("/app/vendas/offline", page);
    await Promise.allSettled(resourcePaths.map(async (path) => {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    }));
  })());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate" && requestUrl.origin === self.location.origin && requestUrl.pathname === "/app/vendas/offline") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/app/vendas/offline", copy)));
        }
        return response;
      }).catch(async () => (await caches.match("/app/vendas/offline")) || Response.error())
    );
    return;
  }

  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith("/api/") ||
    event.request.mode === "navigate"
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
