const CACHE_VERSION = 'clasesde10-pwa-v95';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAmxd60aRYpOrrORXpNJbsnwVaJf2S77E8',
  authDomain: 'clasesde10-50add.firebaseapp.com',
  projectId: 'clasesde10-50add',
  storageBucket: 'clasesde10-50add.firebasestorage.app',
  messagingSenderId: '895894357385',
  appId: '1:895894357385:web:0c111a81b31f404a094d58',
};
let firebaseMessagingReady = false;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/css/style.css',
  '/js/data-schema.js',
  '/js/scale-engine.js',
  '/js/pwa.js',
  '/js/nav.js',
  '/pages/login.html',
  '/pages/registro.html',
  '/pages/reset-password.html',
  '/pages/crear-contrasena.html',
  '/assets/img/logo-192.png',
  '/assets/img/logo-512.png'
];

const PRIVATE_PATHS = [
  /^\/pages\/dashboard\//,
  /^\/offline(?:\.html)?$/,
  /^\/__\//,
  /^\/supabase\//,
  /^\/firebase\//,
  /^\/firebase\.json$/,
  /^\/\.firebaserc$/,
  /^\/\.netlify\//
];

const AUTH_SHELL_PATHS = [
  /^\/pages\/login(?:\.html)?$/,
  /^\/pages\/registro(?:\.html)?$/,
  /^\/pages\/reset-password(?:\.html)?$/,
  /^\/pages\/crear-contrasena(?:\.html)?$/,
];

try {
  importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');
  if (self.firebase && !self.firebase.apps.length) self.firebase.initializeApp(FIREBASE_CONFIG);
  if (self.firebase?.messaging) {
    const messaging = self.firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const title = notification.title || data.title || 'ClasesDe10';
      const body = notification.body || data.body || '';
      self.registration.showNotification(title, {
        body,
        icon: notification.icon || '/assets/img/logo-192.png',
        badge: '/assets/img/logo-192.png',
        tag: data.notificationId || data.type || 'clasesde10-push',
        data: {
          ...data,
          url: data.url || payload.fcmOptions?.link || '/pages/login.html',
        },
      });
    });
    firebaseMessagingReady = true;
  }
} catch (error) {
  firebaseMessagingReady = false;
  console.warn('Firebase Messaging no disponible en service worker', error);
}

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.some((pattern) => pattern.test(pathname));
}

function isAuthShellPath(pathname) {
  return AUTH_SHELL_PATHS.some((pattern) => pattern.test(pathname));
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

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      isAuthShellPath(url.pathname)
        ? networkFirstAuthShell(url.pathname, request, event)
        : isPrivatePath(url.pathname)
        ? networkOnlyPrivatePage(request, event)
        : networkFirstPage(request, event)
    );
    return;
  }

  if (isPrivatePath(url.pathname)) return;

  if (['style', 'script', 'manifest'].includes(request.destination)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url
    || event.notification?.data?.FCM_MSG?.data?.url
    || event.notification?.data?.FCM_MSG?.fcmOptions?.link
    || '/pages/login.html';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.includes(self.location.origin));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});

async function networkOnlyPrivatePage(request, event) {
  try {
    const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
    return preload || await fetch(request);
  } catch (_) {
    return offlineFallbackResponse();
  }
}

async function networkFirstAuthShell(pathname, request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cacheKey = pathname.endsWith('.html') ? pathname : `${pathname}.html`;

  try {
    const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
    const response = preload || await fetch(request);
    if (response && response.ok) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (_) {
    return cache.match(cacheKey)
      || caches.match(cacheKey, { ignoreSearch: true })
      || offlineFallbackResponse();
  }
}

async function networkFirstPage(request, event) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
    const response = preload || await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || offlineFallbackResponse();
  }
}

async function offlineFallbackResponse() {
  const offline = await caches.match('/offline.html', { ignoreSearch: true });
  return offline || new Response(
    '<!doctype html><title>Sin conexion | ClasesDe10</title><h1>Sin conexion</h1><p>Vuelve a intentarlo cuando recuperes internet.</p>',
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
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
