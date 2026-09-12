/* pikante pe — Service Worker (PWA instalable) */
const CACHE = 'pikantepe-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // No cachear API ni media (videos/imágenes pesadas), ni los chunks de Next
  // (si no, en desarrollo se sirve JavaScript viejo y la app se queda colgada).
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/media') || url.pathname.startsWith('/_next')) return;
  if (url.origin !== self.location.origin) return;

  // Navegación (páginas): SIEMPRE red, nunca se cachea el HTML
  if (request.mode === 'navigate') return;

  // Estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
