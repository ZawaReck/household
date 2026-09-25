self.addEventListener("push", (event) => {
  let payload = { title: "家計簿", body: "月末残高を更新してください。", url: "/graphs?tab=portfolio" };
  try { payload = { ...payload, ...(event.data?.json() ?? {}) }; } catch { /* use fallback */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: "household-month-end",
    data: { url: payload.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows[0];
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return clients.openWindow(target);
  }));
});
