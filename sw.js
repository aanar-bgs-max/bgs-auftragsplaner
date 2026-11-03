// Service Worker: macht die App offline nutzbar und installierbar.
// Bei jeder neuen Version CACHE_VERSION erhöhen (gleich wie js/version.js).
const CACHE_VERSION = '3.0.0';
const CACHE = `bgs-planer-${CACHE_VERSION}`;

const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ai.js', 'js/dates.js', 'js/parser.js', 'js/recurrence.js', 'js/store.js',
  'js/ui.js', 'js/version.js', 'js/view-state.js', 'js/voice.js',
  'js/views/calendar.js', 'js/views/day.js', 'js/views/people.js', 'js/views/report.js', 'js/views/settings.js',
  'img/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bgs-planer-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eigene Dateien: zuerst aus dem Netz (immer aktuell), ohne Netz aus dem Cache.
// Anfragen an andere Server (KI) gehen unverändert direkt raus.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('index.html'))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
