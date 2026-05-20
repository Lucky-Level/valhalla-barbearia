const CACHE_NAME = 'valhalla-barbearia-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/css/style.css',
  '/js/config.js',
  '/js/booking.js',
  '/js/admin.js',
  '/js/shop.js',
  '/js/loyalty.js',
  '/js/auth.js',
  '/icons/icon.svg',
  '/icons/logo.png',
  '/manifest.json',
  '/manifest-admin.json'
];

// Install: cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API calls, cache-first for static
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-http(s) schemes (chrome-extension, etc)
  if (!url.protocol.startsWith('http')) return;

  // API calls (Supabase) - always network
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // CDN resources - network first, fallback to cache
  if (url.hostname !== location.hostname) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets - cache first, fallback to network
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        });
        return cached || fetchPromise;
      })
  );
});
