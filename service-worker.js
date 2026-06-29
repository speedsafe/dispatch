const CACHE_NAME = 'speedsafe-dispatch-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/speedsafe-dispatch.css',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Cache addAll error:', err);
      });
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
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http schemes
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then(response => {
      if (response) return response;

      return fetch(request).then(response => {
        // Don't cache if not successful
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          // Safely add to cache, ignoring errors
          cache.put(request, responseToCache).catch(err => {
            console.warn('Cache put error:', err);
          });
        }).catch(err => {
          console.warn('Cache open error:', err);
        });

        return response;
      }).catch(() => {
        // Return fallback if offline
        return caches.match('/index.html');
      });
    })
  );
});

self.addEventListener('push', event => {
  const options = {
    badge: '/badge-icon.png',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%231a8dff" width="192" height="192"/><text x="96" y="96" font-size="120" font-weight="bold" fill="white" text-anchor="middle" dy=".35em">S</text></svg>',
    tag: 'speedsafe-notification',
    requireInteraction: true
  };

  if (event.data) {
    try {
      const data = event.data.json();
      options.title = data.title || 'SpeedSafe Dispatch';
      options.body = data.body || 'New notification';
      options.data = data.data || {};
    } catch (e) {
      options.title = 'SpeedSafe Dispatch';
      options.body = event.data.text();
    }
  } else {
    options.title = 'SpeedSafe Dispatch';
    options.body = 'New appointment assigned';
  }

  event.waitUntil(self.registration.showNotification(options.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-locations') {
    event.waitUntil(
      fetch('/api/sync-locations', { method: 'POST' })
        .catch(err => console.error('Sync error:', err))
    );
  }
});
