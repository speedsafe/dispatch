const CACHE_NAME = 'speedsafe-dispatch-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/speedsafe-dispatch.css',
  '/speedsafe-dispatch-app.jsx',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        return caches.match('/index.html');
      });
    })
  );
});

self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'SpeedSafe Dispatch Update',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%230f0f0f" width="192" height="192"/><circle cx="96" cy="96" r="80" fill="%231a8dff"/><text x="96" y="115" font-size="60" font-weight="bold" fill="white" text-anchor="middle">SS</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%231a8dff" width="192" height="192"/></svg>',
    vibrate: [200, 100, 200],
    tag: 'speedsafe-dispatch'
  };

  event.waitUntil(
    self.registration.showNotification('SpeedSafe Dispatch', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-locations') {
    event.waitUntil(syncLocations());
  }
});

async function syncLocations() {
  try {
    const response = await fetch('/api/sync-queue', { method: 'POST' });
    return response.json();
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
