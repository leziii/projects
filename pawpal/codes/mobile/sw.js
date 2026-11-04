// PawPal service worker. E1-5: pages network first, last copy when offline; API calls never cached.
// E2-5: shows push alerts and opens the message when one is tapped.
// The dev server serves this file with DEV = true: then nothing is cached, so development always shows fresh code.
const DEV = false;
const CACHE = 'pawpal-v1';
const SHELL = ['/', '/manifest.webmanifest', '/static/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((DEV ? Promise.resolve() : caches.open(CACHE).then((c) => c.addAll(SHELL))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (DEV || event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PawPal', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PawPal', {
      body: data.body || '',
      icon: '/static/icons/icon-192.png',
      badge: '/static/icons/icon-192.png',
      tag: data.url || 'pawpal',
      renotify: true,
      requireInteraction: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      return open ? open.navigate(url).then((w) => (w || open).focus()) : self.clients.openWindow(url);
    }),
  );
});
