// service-worker.js - basic caching SW for PWA
const CACHE_NAME = 'fupa-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/karyawan.html',
  '/admin.html',
  '/app.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Network-first for API calls, Cache-first for navigation/static
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // optionally cache certain responses
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});