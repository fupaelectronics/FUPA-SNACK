// service-worker.js
// Cara setup:
// 1. Simpan file ini di root folder proyek (sejajar index.html).
// 2. Daftarkan di setiap HTML tepat sebelum </body>:
//    <script>
//      if ('serviceWorker' in navigator) {
//        navigator.serviceWorker.register('service-worker.js');
//      }
//    </script>

// Nama cache dan daftar asset yang akan di-cache
const CACHE_NAME = 'fupa-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './karyawan.html',
  './admin.html',
  './app.js',
  './manifest.webmanifest',
  './service-worker.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL,GRAD@1,200'
];

// Install: pre-cache semua asset
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: bersihkan cache lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// Fetch: intercept request, serve cache dulu, lalu jaringan
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // jangan cache request non-GET
        if (event.request.method !== 'GET') return response;
        // cache response untuk next visit
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    }).catch(() => {
      // fallback ke cache root jika offline dan asset tidak ditemukan
      return caches.match('./');
    })
  );
});