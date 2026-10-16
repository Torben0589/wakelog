/* WakeLog Service Worker – wird beim Build nach dist/sw.js kopiert und befüllt.
 * Datenschutz: Dieser Service Worker cached ausschließlich die App-Dateien (Code, Styles, Icons).
 * Persönliche Schlafdaten liegen nur in IndexedDB und gelangen nie in den Cache Storage.
 */
const VERSION = self.__WAKELOG_VERSION__;
const PRECACHE = self.__WAKELOG_PRECACHE__;
const CACHE = `wakelog-app-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' umgeht den HTTP-Cache, damit keine veralteten Dateien gespeichert werden
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
  // Kein automatisches skipWaiting: die App zeigt „Update verfügbar“ und der Nutzer entscheidet.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('wakelog-app-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // keine fremden Ressourcen anfassen

  // Navigation (App-Start, Reload): immer die App-Shell aus dem Cache → startet offline zuverlässig.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const shell = await cache.match('./');
        if (shell) return shell;
        try {
          return await fetch(req);
        } catch {
          return new Response('<h1>WakeLog ist offline noch nicht verfügbar.</h1><p>Bitte einmal mit Internetverbindung öffnen.</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  // Statische Dateien: Cache zuerst, sonst Netzwerk (ohne Nachspeichern unbekannter URLs).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
