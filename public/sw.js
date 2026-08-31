const cacheName = "the-grind-2:assets:v0.5.27";
const shell = ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(shell)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("the-grind-2:assets:") && key !== cacheName)
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(cacheName).then((cache) => cache.put("./index.html", copy)),
            );
          }
          return response;
        })
        .catch(async () => (await caches.match("./index.html")) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached !== undefined) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(
          caches.open(cacheName).then((cache) => cache.put(event.request, copy)),
        );
      }
      return response;
    }),
  );
});
