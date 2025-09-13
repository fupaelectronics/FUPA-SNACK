// Service Worker for Fupa Snack System
const CACHE_NAME = 'fupa-snack-v3.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/karyawan.html',
  '/admin.html',
  '/app.js',
  '/manifest.webmanifest',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL,GRAD@1,200',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache addAll error:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('firebase') && !event.request.url.includes('googleapis')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Background sync for presence data
self.addEventListener('sync', event => {
  if (event.tag === 'presence-sync') {
    console.log('Background sync for presence data');
    // This would be implemented to sync any pending presence records
    // For now, we'll just show a notification
    self.registration.showNotification('FUPA Snack', {
      body: 'Data presensi sedang disinkronisasi',
      icon: 'https://api.dicebear.com/7.x/initials/svg?seed=FUPA&backgroundColor=ffb300,ffd54f&radius=20'
    });
  }
});

// Push notifications
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: 'https://api.dicebear.com/7.x/initials/svg?seed=FUPA&backgroundColor=ffb300,ffd54f&radius=20',
      badge: 'https://api.dicebear.com/7.x/initials/svg?seed=F&backgroundColor=ffb300,ffd54f&radius=20',
      vibrate: [200, 100, 200],
      tag: 'fupa-notification'
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click event
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});