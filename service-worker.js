const CACHE_VERSION = 'clasesde10-pwa-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/css/style.css',
  '/js/pwa.js',
  '/js/nav.js',
  '/assets/img/logo-192.png',
  '/assets/img/logo-512.png'
];

const PRIVATE_PATHS = [
  /^\/pages\/dashboard\//,
  /^\/pages\/login(?:\.html)?$/,
  /^\/pages\/registro(?:\.html)?$/,
  /^\/pages\/reset-password(?:\.html)?$/,
  /^\/offline(?:\.html)?$/,
  /^\/__\//,
  /^\/supabase\//,
  /^\/firebase\//,
  /^\/firebase\.json$/,
  /^\/\.firebaserc$/,
  /^\/\.netlify\//
];

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.some((pattern) => pattern.test(pathname));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => !key.startsWith(CACHE_VERSION))
        .map((key) => caches.delete(key))
    );

    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request, event));
    return;
  }

  if (['style', 'script', 'manifest'].includes(request.destination)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstPage(request, event) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const response = preload || await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    return cached || caches.match('/offline.html');
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return cache.match(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
