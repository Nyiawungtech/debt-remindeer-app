/* Public app shell only. Never cache authenticated API responses or debt records. */
const CACHE = "settleup-shell-20743a39b5ede68b";
// The release builder adds the exact hashed assets for this version.
const PRECACHE = ["/index.html","/offline.html","/manifest.webmanifest","/icon.svg","/icon-192.png","/icon-512.png","/icon-512-maskable.png","/apple-touch-icon.png","/assets/dm-sans-latin-400-normal-BwCSEQnW.woff","/assets/dm-sans-latin-400-normal-CW0RaeGs.woff2","/assets/dm-sans-latin-500-normal-B9HHJjqV.woff2","/assets/dm-sans-latin-500-normal-Dr3UlScf.woff","/assets/dm-sans-latin-600-normal-Aqo67rzb.woff2","/assets/dm-sans-latin-600-normal-BmdmIIQ2.woff","/assets/dm-sans-latin-700-normal-CUSSCpQX.woff","/assets/dm-sans-latin-700-normal-DvUfVpUG.woff2","/assets/index-ByNgKbuq.css","/assets/index-CeYyqcfX.js","/assets/manrope-latin-600-normal-4f0koTD-.woff2","/assets/manrope-latin-600-normal-BqgrALkZ.woff","/assets/manrope-latin-700-normal-BZp_XxE4.woff2","/assets/manrope-latin-700-normal-DGRFkw-m.woff","/assets/p-C5zGntuD-NMkj3RGO.js","/assets/p-C8n1kmjg-DTYNPY5E.js","/assets/p-CmDwAGfM-49wDFQiz.js","/assets/p-CyKwPay6-DGKOL5sM.js","/assets/p-DWh32GVO-Df-urjgJ.js","/assets/p-ZjP4CjeZ-DJ1DGIsW.js"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE &&
                (key.startsWith("settleup-shell-") ||
                  key.startsWith("duewell-shell-")),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
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
      fetch(event.request).catch(
        async () =>
          (await caches.match("/index.html")) ||
          (await caches.match("/offline.html")),
      ),
    );
    return;
  }
  if (
    !url.pathname.startsWith("/assets/") &&
    ![
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-512-maskable.png",
      "/apple-touch-icon.png",
      "/manifest.webmanifest",
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
function localTarget(value) {
  try {
    const url = new URL(
      typeof value === "string" ? value : "/#reminders",
      self.location.origin,
    );
    if (
      url.origin === self.location.origin &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      url.hash.startsWith("#")
    )
      return "/" + url.hash;
  } catch {}
  return "/#reminders";
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(
      typeof data.title === "string"
        ? data.title.slice(0, 80)
        : "SettleUp reminder",
      {
        body:
          typeof data.body === "string"
            ? data.body
            : "You have a payment coming up. Open SettleUp to review it.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: typeof data.tag === "string" ? data.tag : "settleup-reminder",
        data: { url: localTarget(data.url) },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    localTarget(event.notification.data?.url),
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const client = windows.find((item) => {
          try {
            return new URL(item.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (client) {
          await client.navigate(target);
          return client.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
