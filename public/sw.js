// Notification service worker for the shop and the admin. It shows pushed notifications
// and the admin app's own alerts, and opens the right page when one is tapped.
// No caching, no offline logic.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Ndeeelicious Delight", {
      body: message.body || "",
      tag: message.tag,
      renotify: Boolean(message.tag),
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  // Only ever open pages on this site.
  if (target.origin !== self.location.origin) return;
  const admin = target.pathname.startsWith("/admin");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        const url = new URL(client.url);
        if (url.origin === target.origin && url.pathname.startsWith("/admin") === admin && "focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target.href).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
