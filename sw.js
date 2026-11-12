/* Questline service worker: keeps the app usable offline once it has been opened
   from http://localhost or a hosted https address. Change VERSION after editing
   app files so installed copies pick up the new ones. */
const VERSION = 'questline-1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/store.js', 'js/catalog.js', 'js/templates.js', 'js/engine.js',
  'js/ai.js', 'js/connectors.js', 'js/views.js', 'js/modals.js', 'js/app.js',
  'fonts/bricolage.woff2', 'fonts/instrument.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* App files: try the network first so edits show up, fall back to the saved copy when offline.
   Calls to other sites (the AI service, Google) are left alone. */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
  );
});
