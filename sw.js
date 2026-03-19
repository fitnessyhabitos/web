/**
 * CENSOR ENGINE PRO — Service Worker
 * Caches the app shell for offline availability.
 * NOTE: MediaPipe model files are large; they use their own CDN cache.
 */

const CACHE_NAME = 'censor-engine-pro-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/src/main.js',
  '/src/face-censor.js',
  '/src/webgl-effects.js',
  '/src/timeline.js',
  '/src/audio-mixer.js',
  '/src/exporter.js',
  '/manifest.json',
];

// ─── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Some files may not exist yet (icons etc.) — ignore individually
        console.warn('[SW] Some files not cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch strategy: Cache-first for app shell, Network-first for CDN ────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network-first for MediaPipe CDN files (they cache themselves)
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
