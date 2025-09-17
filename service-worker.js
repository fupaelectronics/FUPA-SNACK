const CACHE_NAME = 'fupa-presensi-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/karyawan.html',
  '/admin.html',
  '/app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL,GRAD@1,200'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});