/*!
 * Raysin Calculator · service worker
 * Precache delle risorse statiche, funzionamento offline, aggiornamento controllato.
 * A ogni rilascio aumentare VERSION (e APP_VERSION in js/app.js): la cache vecchia viene eliminata.
 */
'use strict';

var VERSION = '1.0.0';
var CACHE = 'raysin-' + VERSION;

// Percorsi relativi allo scope: funziona sia in locale sia su GitHub Pages (https://utente.github.io/repo/).
var ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/calc.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // cache: 'reload' evita di salvare copie vecchie dalla cache HTTP del browser
      return cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    })
  );
  // Prima installazione: attivazione immediata. Aggiornamenti: si attende il tocco su "Aggiorna".
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('raysin-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigazione: pagina dalla cache (offline-first), con index.html come riserva.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then(function (cached) {
        return cached || fetch(req);
      }).catch(function () { return caches.match('./'); })
    );
    return;
  }

  // Risorse statiche: cache-first, poi rete (e salvataggio in cache delle risorse nuove).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
