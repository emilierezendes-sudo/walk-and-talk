// Lets the app open quickly (and offline) once installed.
// Network first for the app's own files so updates show up right away; falls back to the saved copy offline.
const CACHE = 'walk-and-talk-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'js/db.js', 'js/ui.js', 'js/views.js',
  'js/components.js', 'js/flows.js', 'js/stats.js', 'js/icons.js', 'js/geo.js', 'js/mapview.js', 'js/backend-supabase.js', 'js/backend-demo.js',
  'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch Supabase traffic
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
