/* Handles background assignment notifications only; no customer information is included. */
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { payload = null; }
  if (!payload || !/^\d+$/.test(String(payload.assignmentId)) || !/^\d+$/.test(String(payload.orderId))) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const focusedDashboard = windows.find((client) => {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin && url.pathname === "/driver/dashboard" && client.focused;
      } catch { return false; }
    });
    if (focusedDashboard) {
      focusedDashboard.postMessage({ type: "driver-assignment-push", assignmentId: payload.assignmentId, orderId: payload.orderId });
      return;
    }

    const orderId = /^\d+$/.test(payload.orderId) ? payload.orderId : null;
    await self.registration.showNotification("New delivery assignment", {
      body: "A delivery has been assigned to you. Open the driver portal to review it.",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: `driver-assignment-${payload.assignmentId}`,
      renotify: false,
      data: { path: orderId ? `/driver/deliveries/${orderId}` : "/driver/dashboard" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidatePath = event.notification.data?.path;
  const path = candidatePath === "/driver/dashboard" || /^\/driver\/deliveries\/\d+$/.test(candidatePath || "")
    ? candidatePath
    : "/driver/dashboard";
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      await existing.navigate(target.href);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
