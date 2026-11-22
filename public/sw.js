/* Cache public assets only. Never store authentication, API responses or debt data. */
const CACHE = "duewell-shell-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          "/offline.html",
        ]),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(async () => {
        // Retire existing device subscriptions when upgrading to email-only.
        try {
          const subscription =
            await self.registration.pushManager?.getSubscription();
          if (subscription) await subscription.unsubscribe();
        } catch {
          /* Email delivery does not depend on browser push support. */
        }
        await self.clients.claim();
      }),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (
    !url.pathname.startsWith("/assets/") &&
    ![
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/apple-touch-icon.png",
    ].includes(url.pathname)
  )
    return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
