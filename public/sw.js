/**
 * Traveldesk Service Worker — handles Web Push notifications.
 *
 * When a push arrives and no Traveldesk tab is focused, the browser shows
 * a system notification. Clicking it opens (or focuses) the app.
 */

const APP_URL = self.registration.scope;

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Traveldesk", body: event.data.text() };
  }

  const title = payload.title ?? "Traveldesk";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/favicon.ico",
    badge: payload.badge ?? "/favicon.ico",
    tag: payload.tag ?? "traveldesk",
    data: { url: payload.url ?? APP_URL, ...(payload.data ?? {}) },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? APP_URL;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If there is already a tab open on the app, focus it.
      for (const client of windowClients) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab.
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});

// Keep the SW alive for background sync in future.
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
