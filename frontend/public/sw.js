/* pikante pe - Service Worker (PWA instalable)
 *
 * IMPORTANTE: NUNCA cachear HTML ni los datos RSC de Next.js (peticiones con
 * header "RSC" o query "?_rsc="). Si se cachean, en produccion se sirve una
 * version vieja de la pagina mezclada con JS nuevo y la app se congela /
 * pierde la sesion. El SW solo guarda estaticos (imagenes, fuentes).
 */
const CACHE = 'pikantepe-v3';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Detecta peticiones de datos/navegacion de Next.js (RSC). Nunca se cachean.
function isNextDocument(request, url) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  if (request.headers.get('RSC') === '1') return true;
  if (request.headers.get('Next-Router-Prefetch')) return true;
  if (url.searchParams.has('_rsc')) return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('text/x-component');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/media') || url.pathname.startsWith('/_next')) return;
  if (request.headers.get('range')) return;

  // Navegacion y datos RSC: SIEMPRE red (bypass del cache HTTP, que antes
  // quedo envenenado con respuestas "immutable" de un build viejo).
  if (isNextDocument(request, url)) {
    event.respondWith(
      fetch(request, { cache: 'reload' }).catch(() => (
        request.mode === 'navigate' ? caches.match(OFFLINE_URL) : Response.error()
      ))
    );
    return;
  }

  // Resto (imagenes, fuentes, etc.): red primero, cache como respaldo.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
