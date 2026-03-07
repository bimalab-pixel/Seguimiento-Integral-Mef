// ══════════════════════════════════════════════════════════
//  Service Worker — Seguimiento Integral MEF · MINSAL El Salvador
//  Versión: 2.0
// ══════════════════════════════════════════════════════════

const CACHE_NAME = 'mef-minsal-v2';
const CACHE_DURATION_DAYS = 7;

// Archivos que se guardan en caché al instalar
const STATIC_FILES = [
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Nunito:wght@300;400;500;600;700;800;900&display=swap'
];

// ── INSTALL: pre-cachear archivos esenciales ──
self.addEventListener('install', event => {
  console.log('[SW] Instalando v2...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_FILES.map(url =>
          cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] Instalación completa');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: eliminar cachés antiguos ──
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia Cache First con fallback a red ──
self.addEventListener('fetch', event => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  // No interceptar peticiones de Firebase / APIs externas
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebase') ||
      url.includes('googleapis.com/v1') ||
      url.includes('anthropic')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Servir desde caché y actualizar en segundo plano
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {});
        return cached;
      }

      // No está en caché: intentar red
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Sin red y sin caché: devolver página principal como fallback
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ── MENSAJE: forzar actualización desde la app ──
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
