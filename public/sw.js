/*
 * Orbit service worker — minimal, hand-rolled.
 *
 * Purpose is installability + web push, NOT offline data. It precaches only the
 * static app shell (the offline fallback, icons, manifest) so the browser
 * considers the app installable, serves a bare offline page when a navigation
 * fails, and passes EVERYTHING else straight to the network. API and data
 * responses are never cached — an owner decision — so the installed app always
 * shows live data or, with no connection, the offline page.
 */
const SHELL = "orbit-shell-v3";
const SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/*
 * Network-first, and only for top-level navigations. Everything dynamic goes to
 * the network every time; the sole fallback is the offline page when a page
 * navigation cannot reach the server. Non-navigation requests are not
 * intercepted at all, so nothing about API/data caching changes.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});

/*
 * Web push. The server sends { title, body, icon, tag, url }; show it, and on
 * click focus an existing Orbit tab (navigating it to url) or open a new one.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }
  const title = data.title || "Orbit";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "orbit",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
