// service-worker.js
const CACHE_NAME = 'fupa-snack-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/karyawan.html',
  '/admin.html',
  '/app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL,GRAD@1,200'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});